/// <reference lib="webworker" />
/*
 * On-device ink recognition in a Web Worker (see ./inkOcr.ts). Two open models, downloaded once from
 * Hugging Face and cached by the browser, then offline:
 *   text: TrOCR small, fine-tuned on handwritten lines (IAM), 8-bit: ~64 MB
 *   math: pix2text MFR (TrOCR-style formula recogniser that outputs LaTeX): ~118 MB
 * Where the browser has WebGPU, the image encoder (most of the work) runs on the graphics chip: the
 * text model then fetches its fp16 encoder once (~44 MB more), maths reuses the same file. The decoders
 * stay on WebAssembly (8-bit weights run poorly on WebGPU), and any GPU failure falls back to WebAssembly.
 * pix2text ships its ONNX files at the repo root and only a cache-less decoder, so the worker maps the
 * file names transformers.js asks for, and runs the decoder in its own greedy loop (full prefix per step).
 */
import { AutoProcessor, AutoTokenizer, env, pipeline, RawImage, Tensor, VisionEncoderDecoderModel } from "@huggingface/transformers";
import { MATH_MODEL, TEXT_MODEL } from "./inkOcrModels";

declare const self: DedicatedWorkerGlobalScope;

const MAX_MATH_TOKENS = 160;

env.allowLocalModels = false;

const realFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes(`/${MATH_MODEL}/`)) {
    const mapped = url
      .replace(/\/onnx\/encoder_model[^/]*\.onnx/, "/encoder_model.onnx")
      .replace(/\/onnx\/decoder_model_merged[^/]*\.onnx/, "/decoder_model.onnx");
    return realFetch(mapped, init);
  }
  return realFetch(input, init);
}) as typeof fetch;

type Img = { width: number; height: number; data: Uint8ClampedArray };
type Job = { id: number; kind: "text" | "math"; images: Img[] };

const progress = (id: number, what: string) => (p: { status?: string; file?: string; progress?: number }) => {
  if (p.status === "progress" && p.file?.endsWith(".onnx") && typeof p.progress === "number") {
    self.postMessage({ id, type: "status", status: `Downloading ${what} model ${Math.round(p.progress)}% (one time only)` });
  }
};

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

type OrtSession = { run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims: number[] }>> };
type MathKit = { proc: (img: RawImage) => Promise<{ pixel_values: unknown }>; tok: { decode: (ids: number[], o: object) => string }; enc: OrtSession; dec: OrtSession; start: number; eos: number };
let mathKit: Promise<MathKit> | null = null;
function loadMath(id: number): Promise<MathKit> {
  mathKit ??= (async () => {
    const opts = { progress_callback: progress(id, "maths") };
    const g = await gpu();
    const loadModel = (onGpu: boolean) => VisionEncoderDecoderModel.from_pretrained(MATH_MODEL,
      { ...opts, dtype: "fp32", device: onGpu ? split("webgpu", "wasm") : "wasm" } as Parameters<typeof VisionEncoderDecoderModel.from_pretrained>[1]);
    const [proc, tok, model] = await Promise.all([
      AutoProcessor.from_pretrained(MATH_MODEL, opts),
      AutoTokenizer.from_pretrained(MATH_MODEL, opts),
      g ? loadModel(true).catch(() => { gpuBroken = true; return loadModel(false); }) : loadModel(false),
    ]);
    const m = model as unknown as { sessions: Record<string, OrtSession>; config: { decoder_start_token_id?: number; eos_token_id?: number }; generation_config?: { decoder_start_token_id?: number; eos_token_id?: number } };
    return {
      proc: proc as unknown as MathKit["proc"], tok: tok as unknown as MathKit["tok"],
      enc: m.sessions.model, dec: m.sessions.decoder_model_merged,
      start: m.generation_config?.decoder_start_token_id ?? m.config.decoder_start_token_id ?? 2,
      eos: m.generation_config?.eos_token_id ?? m.config.eos_token_id ?? 2,
    };
  })().catch((e) => { mathKit = null; throw e; });
  return mathKit;
}

const toImage = (i: Img) => new RawImage(i.data, i.width, i.height, 4).rgb();
const ort = (t: unknown) => (t as { ort_tensor?: unknown }).ort_tensor ?? t;

async function readMath(kit: MathKit, img: Img): Promise<string> {
  const { pixel_values } = await kit.proc(toImage(img));
  const { last_hidden_state } = await kit.enc.run({ pixel_values: ort(pixel_values) });
  const ids = [kit.start];
  for (let step = 0; step < MAX_MATH_TOKENS; step++) {
    const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
    const { logits } = await kit.dec.run({ input_ids: ort(input_ids), encoder_hidden_states: last_hidden_state });
    const V = logits.dims[2], off = (ids.length - 1) * V, d = logits.data;
    let best = 0, bv = -Infinity;
    for (let v = 0; v < V; v++) if (d[off + v] > bv) { bv = d[off + v]; best = v; }
    if (best === kit.eos) break;
    ids.push(best);
  }
  return kit.tok.decode(ids.slice(1), { skip_special_tokens: true });
}

async function recognize(id: number, kind: Job["kind"], images: Img[]): Promise<string[]> {
  const texts: string[] = [];
  if (kind === "text") {
    const run = await loadText(id);
    for (let i = 0; i < images.length; i++) {
      self.postMessage({ id, type: "status", status: `Reading handwriting ${i + 1} / ${images.length}...` });
      texts.push((await run(toImage(images[i])))[0]?.generated_text ?? "");
    }
  } else {
    const kit = await loadMath(id);
    self.postMessage({ id, type: "status", status: "Reading the formula..." });
    for (const img of images) texts.push(await readMath(kit, img));
  }
  return texts;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, kind, images } = e.data;
  try {
    let texts: string[];
    try {
      texts = await recognize(id, kind, images);
    } catch (err) {
      // a GPU that loaded but fails to run (driver bug, lost device): rebuild on WebAssembly and retry once
      if (gpuBroken || !(await gpu())) throw err;
      gpuBroken = true;
      textPipe = null;
      mathKit = null;
      texts = await recognize(id, kind, images);
    }
    self.postMessage({ id, type: "result", texts });
  } catch (err) {
    self.postMessage({ id, type: "error", message: `Recognition failed: ${err instanceof Error ? err.message : String(err)}` });
  }
};
