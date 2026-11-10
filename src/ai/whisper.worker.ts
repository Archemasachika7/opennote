/// <reference lib="webworker" />
/* Whisper in a Web Worker (see ./whisper.ts). The ONNX runtime comes from the app (public/vendor/ort);
   the model comes from Hugging Face once and is cached by the browser (Cache API). */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { WHISPER_MODEL, type AsrOptions } from "./whisper";

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string } };
if (onnx.wasm) onnx.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}vendor/ort/`, self.location.href).href;

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load(status: (s: string) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  const progress_callback = (p: { status?: string; file?: string; progress?: number }) => {
    if (p.status === "progress" && p.file?.endsWith(".onnx") && typeof p.progress === "number") {
      status(`Downloading speech model ${Math.round(p.progress)}% (one time only)`);
    }
  };
  // pipeline() has huge overloads; a narrow signature keeps the type checker fast
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<AutomaticSpeechRecognitionPipeline>;
  const build = (device: "webgpu" | "wasm") => make("automatic-speech-recognition", WHISPER_MODEL, {
    device,
    dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback,
  });
  // WebGPU is much faster where it exists; fall back to plain WebAssembly everywhere else
  asr ??= ("gpu" in navigator ? build("webgpu").catch(() => build("wasm")) : build("wasm"))
    .catch((err) => { asr = null; throw err; });
  return asr;
}

self.onmessage = async (e: MessageEvent<{ id: number; samples: Float32Array; options: AsrOptions }>) => {
  const { id, samples, options } = e.data;
  const status = (s: string) => self.postMessage({ id, type: "status", status: s });
  try {
    const run = await load(status);
    status("Transcribing on this device...");
    const out = await run(samples, options);
    self.postMessage({ id, type: "result", out: Array.isArray(out) ? out[0] : out });
  } catch (err) {
    self.postMessage({ id, type: "error", message: `On-device transcription failed: ${err instanceof Error ? err.message : String(err)}` });
  }
};
