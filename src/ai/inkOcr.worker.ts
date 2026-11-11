/// <reference lib="webworker" />
/*
 * On-device ink recognition in a Web Worker (see ./inkOcr.ts):
 *   text: TrOCR small, fine-tuned on handwritten lines (IAM), 8-bit: ~64 MB, downloaded once from Hugging
 *         Face and cached by the browser. Reads images of lines (../ink/rasterize.ts).
 *   math: CoMER (ECCV 2022, trained on CROHME handwritten maths) through ink-on (Apache-2.0), 8-bit,
 *         7.2 MB, shipped inside the app (public/models/comer), so it works offline from the first use.
 *         Reads the pen strokes themselves.
 * Where the browser has a working WebGPU adapter, TrOCR's image encoder runs on the graphics chip (its fp16
 * encoder is ~44 MB more); the decoder stays on WebAssembly, and any GPU failure falls back to WebAssembly.
 *
 * Tested 2026-11-11 on ten handwritten-style formulas: CoMER 10/10 at 0.3–2.8 s each, the previous
 * pix2text model ~6/10 at 1.9–6.7 s and a 118 MB download. pix2text was removed.
 */
import { env, pipeline, RawImage } from "@huggingface/transformers";
import { InferenceEngine, isStrokeMeaningful, loadVocab, preprocessStrokes, repairLatex, type Vocab } from "ink-on/core";
import { TEXT_MODEL } from "./inkOcrModels";

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;

type Img = { width: number; height: number; data: Uint8ClampedArray };
export type InkOnStroke = { points: { x: number; y: number }[]; lineWidth: number };
type Job =
  | { id: number; kind: "text"; images: Img[] }
  | { id: number; kind: "math"; formulas: InkOnStroke[][] };

const progress = (id: number, what: string) => (p: { status?: string; file?: string; progress?: number }) => {
  if (p.status === "progress" && p.file?.endsWith(".onnx") && typeof p.progress === "number") {
    self.postMessage({ id, type: "status", status: `Downloading ${what} model ${Math.round(p.progress)}% (one time only)` });
  }
};

/* ---- handwriting → text (TrOCR) ---- */

/** "fp16"/"fp32": WebGPU works (and which float size the encoder can use); null: WebAssembly only. */
type Gpu = "fp16" | "fp32" | null;
let gpuProbe: Promise<Gpu> | null = null;
let gpuBroken = false;
function gpu(): Promise<Gpu> {
  if (gpuBroken) return Promise.resolve(null);
  gpuProbe ??= (async (): Promise<Gpu> => {
    try {
      const g = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ features: { has: (f: string) => boolean } } | null> } }).gpu;
      const adapter = await g?.requestAdapter();
      return adapter ? (adapter.features.has("shader-f16") ? "fp16" : "fp32") : null;
    } catch { return null; }
  })();
  return gpuProbe;
}
/** Encoder on the GPU, decoder on WebAssembly. */
const split = (enc: string, dec: string) => ({ encoder_model: enc, decoder_model_merged: dec });

type TextPipe = (img: RawImage) => Promise<{ generated_text: string }[]>;
let textPipe: Promise<TextPipe> | null = null;
function loadText(id: number): Promise<TextPipe> {
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<TextPipe>;
  const progress_callback = progress(id, "handwriting");
  const wasm = () => make("image-to-text", TEXT_MODEL, { dtype: "q8", device: "wasm", progress_callback });
  textPipe ??= (async () => {
    const g = await gpu();
    if (!g) return wasm();
    return make("image-to-text", TEXT_MODEL, { dtype: split(g, "q8"), device: split("webgpu", "wasm"), progress_callback })
      .catch(() => { gpuBroken = true; return wasm(); });
  })().catch((e) => { textPipe = null; throw e; });
  return textPipe;
}

const toImage = (i: Img) => new RawImage(i.data, i.width, i.height, 4).rgb();

/* ---- handwritten maths → LaTeX (CoMER via ink-on) ---- */

/** The bundled model, next to the app's index.html (works on the web, in the Windows and Android apps). */
const COMER_BASE = new URL("/models/comer/", self.location.href).href;

let comer: Promise<{ engine: InferenceEngine; vocab: Vocab }> | null = null;
function loadMath(): Promise<{ engine: InferenceEngine; vocab: Vocab }> {
  comer ??= (async () => {
    const vocab = await loadVocab(`${COMER_BASE}vocab.json`);
    const engine = new InferenceEngine({
      encoderUrl: `${COMER_BASE}encoder_int8.onnx`, decoderUrl: `${COMER_BASE}decoder_int8.onnx`, executionProvider: "wasm",
    });
    await engine.init();
    return { engine, vocab };
  })().catch((e) => { comer = null; throw e; });
  return comer;
}

/**
 * ink-on draws strokes on `document.createElement("canvas")`, which workers don't have. Lend it an
 * OffscreenCanvas just while the (synchronous) preprocessing runs, then take it away again, so nothing
 * else in the worker ever mistakes it for a page with a DOM.
 */
function withWorkerCanvas<T>(fn: () => T): T {
  const g = self as unknown as { document?: unknown };
  if (g.document !== undefined) return fn();
  g.document = { createElement: (tag: string) => {
    if (tag !== "canvas") throw new Error(`No ${tag} in a worker`);
    return new OffscreenCanvas(1, 1);
  } };
  try { return fn(); } finally { delete g.document; }
}

/** CoMER speaks space-separated tokens ("x ^ { 2 }"); fix unbalanced braces and extra arguments. */
async function readMath(strokes: InkOnStroke[]): Promise<string> {
  if (!isStrokeMeaningful(strokes)) return "";
  const { engine, vocab } = await loadMath();
  const r = await engine.recognize(withWorkerCanvas(() => preprocessStrokes(strokes)), vocab, "auto");
  return repairLatex(r.latex.trim().split(/\s+/)).join(" ");
}

/* ---- jobs ---- */

async function recognize(job: Job): Promise<string[]> {
  const texts: string[] = [];
  if (job.kind === "text") {
    const run = await loadText(job.id);
    for (let i = 0; i < job.images.length; i++) {
      self.postMessage({ id: job.id, type: "status", status: `Reading handwriting ${i + 1} / ${job.images.length}...` });
      texts.push((await run(toImage(job.images[i])))[0]?.generated_text ?? "");
    }
  } else {
    self.postMessage({ id: job.id, type: "status", status: "Reading the formula..." });
    for (const f of job.formulas) texts.push(await readMath(f));
  }
  return texts;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const job = e.data;
  try {
    let texts: string[];
    try {
      texts = await recognize(job);
    } catch (err) {
      // a GPU that loaded but fails to run (driver bug, lost device): rebuild on WebAssembly and retry once
      if (job.kind !== "text" || gpuBroken || !(await gpu())) throw err;
      gpuBroken = true;
      textPipe = null;
      texts = await recognize(job);
    }
    self.postMessage({ id: job.id, type: "result", texts });
  } catch (err) {
    self.postMessage({ id: job.id, type: "error", message: `Recognition failed: ${err instanceof Error ? err.message : String(err)}` });
  }
};
