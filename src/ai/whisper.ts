/**
 * On-device lecture transcription with open-source Whisper (transformers.js). The model downloads once
 * (~40 MB, cached by the browser), then it works offline on web, Android and Windows. Audio never leaves
 * the device. Heavy work runs in a Web Worker so the notebook stays responsive.
 */
import type { TranscriptSegment } from "../store/schema";

/** Small multilingual model: quick on phones, decent on lectures. */
export const WHISPER_MODEL = "onnx-community/whisper-tiny";

export interface AsrChunk { timestamp: [number, number | null]; text: string }
export interface AsrOutput { text?: string; chunks?: AsrChunk[] }
export type AsrOptions = {
  return_timestamps: true; chunk_length_s: number; stride_length_s: number; language?: string; task?: "transcribe";
};
export type Asr = (samples: Float32Array, options: AsrOptions, onStatus?: (s: string) => void) => Promise<AsrOutput>;
export type Decode = (blob: Blob) => Promise<{ samples: Float32Array; durationMs: number }>;

/** App language codes (Sarvam style) → Whisper language names. Unknown → let Whisper detect. */
const LANG: Record<string, string> = {
  "en-IN": "english", "hi-IN": "hindi", "bn-IN": "bengali", "ta-IN": "tamil", "te-IN": "telugu", "mr-IN": "marathi",
  "gu-IN": "gujarati", "kn-IN": "kannada", "ml-IN": "malayalam", "pa-IN": "punjabi", "ur-IN": "urdu",
};

export function chunksToSegments(chunks: AsrChunk[], durationMs: number): TranscriptSegment[] {
  return chunks
    .map((c) => ({
      offsetMs: Math.round(Math.max(0, c.timestamp[0] ?? 0) * 1000),
      endMs: c.timestamp[1] == null ? durationMs : Math.round(c.timestamp[1] * 1000),
      text: c.text.trim(),
    }))
    .filter((s) => s.text.length > 0);
}

/** Decode any recording the browser can play into 16 kHz mono samples (what Whisper expects). */
export const decodeTo16kMono: Decode = async (blob) => {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer()); // resampled to the context rate
  const n = audio.length;
  const samples = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) samples[i] += ch[i] / audio.numberOfChannels;
  }
  return { samples, durationMs: Math.round(audio.duration * 1000) };
};

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (o: AsrOutput) => void; reject: (e: Error) => void; onStatus?: (s: string) => void }>();

/** Runs the model in ./whisper.worker.ts. */
export const workerAsr: Asr = (samples, options, onStatus) => {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; type: "status" | "result" | "error"; status?: string; out?: AsrOutput; message?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      if (e.data.type === "status") job.onStatus?.(e.data.status ?? "");
      else {
        pending.delete(e.data.id);
        if (e.data.type === "result") job.resolve(e.data.out ?? {});
        else job.reject(new Error(e.data.message ?? "Transcription failed."));
      }
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus });
    worker!.postMessage({ id, samples, options }, [samples.buffer]);
  });
};

export async function transcribeWithWhisper(
  blob: Blob,
  opts: { languageCode?: string; onStatus?: (s: string) => void; decode?: Decode; asr?: Asr } = {},
): Promise<{ transcript: string; languageCode?: string; segments: TranscriptSegment[] }> {
  const { decode = decodeTo16kMono, asr = workerAsr, onStatus } = opts;
  onStatus?.("Preparing audio...");
  const { samples, durationMs } = await decode(blob);
  const language = opts.languageCode ? LANG[opts.languageCode] : undefined;
  onStatus?.("Transcribing on this device...");
  const out = await asr(samples, {
    return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
    ...(language ? { language, task: "transcribe" as const } : {}),
  }, onStatus);
  return {
    transcript: (out.text ?? "").trim(),
    languageCode: language ? opts.languageCode : undefined,
    segments: chunksToSegments(out.chunks ?? [], durationMs),
  };
}
