import { useSyncExternalStore } from "react";

export type SarvamMode = "transcribe" | "translate" | "codemix" | "translit";
export type SttEngine = "sarvam" | "browser";

export interface TranscriptSegment {
  offsetMs: number;
  endMs: number;
  text: string;
}

export interface SarvamTranscriptResult {
  transcript: string;
  languageCode?: string;
  segments: TranscriptSegment[];
}

export interface SarvamPrefs {
  languageCode: string;
  mode: SarvamMode;
  engine: SttEngine;
}

export const SARVAM_LANGUAGES: { code: string; label: string }[] = [
  { code: "unknown", label: "Auto-detect language" },
  { code: "en-IN", label: "English (India)" },
  { code: "bn-IN", label: "বাংলা · Bengali" },
  { code: "hi-IN", label: "हिन्दी · Hindi" },
  { code: "ta-IN", label: "தமிழ் · Tamil" },
  { code: "te-IN", label: "తెలుగు · Telugu" },
  { code: "mr-IN", label: "मराठी · Marathi" },
  { code: "gu-IN", label: "ગુજરાતી · Gujarati" },
  { code: "kn-IN", label: "ಕನ್ನಡ · Kannada" },
  { code: "ml-IN", label: "മലയാളം · Malayalam" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ · Punjabi" },
  { code: "od-IN", label: "ଓଡ଼ିଆ · Odia" },
];

export const SARVAM_MODES: { id: SarvamMode; label: string; hint: string }[] = [
  { id: "transcribe", label: "Transcribe", hint: "Native script of spoken language" },
  { id: "translate", label: "Translate -> English", hint: "Any Indic language directly to English notes" },
  { id: "codemix", label: "Code-mix", hint: "Natural Benglish / Hinglish lecture notes" },
  { id: "translit", label: "Romanized", hint: "Spoken words in Latin alphabet" },
];

const KEY_STORAGE = "opennote:sarvam-api-key";
const PREFS_STORAGE = "opennote:sarvam-prefs";
const SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text";
const VERCEL_PROXY_ENDPOINT = "/api/sarvam-stt";
const TARGET_SAMPLE_RATE = 16_000;
const MAX_CHUNK_SEC = 25;

const subs = new Set<() => void>();
let snapshotVersion = 0;
function bump() {
  snapshotVersion++;
  subs.forEach((fn) => fn());
}

function readEnvSarvamKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (env?.VITE_SARVAM_API_KEY ?? "").trim();
  } catch {
    return "";
  }
}

export function hasEnvSarvamKey(): boolean {
  return readEnvSarvamKey().length > 0;
}

export function getSarvamApiKey(): string {
  const envKey = readEnvSarvamKey();
  if (envKey) return envKey;
  try {
    return (localStorage.getItem(KEY_STORAGE) ?? "").trim();
  } catch {
    return "";
  }
}

export function setSarvamApiKey(key: string): void {
  try {
    const clean = key.trim();
    if (clean) localStorage.setItem(KEY_STORAGE, clean);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore storage error */
  }
  bump();
}

export function getSarvamPrefs(): SarvamPrefs {
  const fallbackEngine: SttEngine = getSarvamApiKey() ? "sarvam" : isBrowserSpeechSupported() ? "browser" : "sarvam";
  try {
    const raw = localStorage.getItem(PREFS_STORAGE);
    if (!raw) return { languageCode: "unknown", mode: "transcribe", engine: fallbackEngine };
    const parsed = JSON.parse(raw) as Partial<SarvamPrefs>;
    return {
      languageCode: parsed.languageCode || "unknown",
      mode: parsed.mode || "transcribe",
      engine: parsed.engine || fallbackEngine,
    };
  } catch {
    return { languageCode: "unknown", mode: "transcribe", engine: fallbackEngine };
  }
}

export function setSarvamPrefs(patch: Partial<SarvamPrefs>): void {
  const next = { ...getSarvamPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_STORAGE, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  bump();
}

export function useSarvamConfig(): { apiKey: string; prefs: SarvamPrefs; envManaged: boolean } {
  useSyncExternalStore(
    (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    () => snapshotVersion,
  );
  return {
    apiKey: getSarvamApiKey(),
    prefs: getSarvamPrefs(),
    envManaged: hasEnvSarvamKey(),
  };
}

/** Encode mono Float32 [-1..1] audio samples into a standard 16-bit PCM RIFF/WAVE Uint8Array. */
export function encodePcm16Wav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Uint8Array {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = 1 (PCM)
  view.setUint16(22, 1, true); // channels = 1 (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    off += 2;
  }
  return new Uint8Array(buf);
}

/** Create a tiny valid 16kHz mono silent WAV Blob for testing Sarvam API connectivity without mic access. */
export function createSilentTestWav(durationMs = 350, sampleRate = TARGET_SAMPLE_RATE): Blob {
  const samples = new Float32Array(Math.max(160, Math.round((durationMs / 1000) * sampleRate)));
  const bytes = encodePcm16Wav(samples, sampleRate);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
}

function downsampleMono(audioBuffer: AudioBuffer, targetRate: number): Float32Array {
  const channels = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }
  if (audioBuffer.sampleRate === targetRate) return mono;
  const ratio = audioBuffer.sampleRate / targetRate;
  const outLen = Math.max(1, Math.round(len / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.min(len - 1, Math.floor(srcIdx));
    const i1 = Math.min(len - 1, i0 + 1);
    const frac = srcIdx - i0;
    out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }
  return out;
}

/**
 * Decode an audio Blob into <= 25s 16kHz mono WAV chunks so recordings of ANY duration
 * respect Sarvam synchronous REST's 30-second limit per call.
 */
export async function prepareAudioChunksForSarvam(
  blob: Blob,
  maxChunkSec = MAX_CHUNK_SEC,
): Promise<{ blob: Blob; offsetMs: number; endMs: number; ext: string }[]> {
  const maxBytesDirectWav = TARGET_SAMPLE_RATE * 2 * maxChunkSec + 512;
  if (blob.type === "audio/wav" && blob.size <= maxBytesDirectWav) {
    const approxMs = Math.max(300, Math.round(((blob.size - 44) / (TARGET_SAMPLE_RATE * 2)) * 1000));
    return [{ blob, offsetMs: 0, endMs: approxMs, ext: "wav" }];
  }

  const AudioCtx = (globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx && typeof blob.arrayBuffer === "function") {
    let ctx: AudioContext | null = null;
    try {
      const rawBuf = await blob.arrayBuffer();
      ctx = new AudioCtx();
      const decoded = await ctx.decodeAudioData(rawBuf.slice(0));
      const mono = downsampleMono(decoded, TARGET_SAMPLE_RATE);
      const samplesPerChunk = TARGET_SAMPLE_RATE * maxChunkSec;
      const chunks: { blob: Blob; offsetMs: number; endMs: number; ext: string }[] = [];
      for (let start = 0; start < mono.length; start += samplesPerChunk) {
        const end = Math.min(mono.length, start + samplesPerChunk);
        const slice = mono.subarray(start, end);
        const wavBytes = encodePcm16Wav(slice, TARGET_SAMPLE_RATE);
        chunks.push({
          blob: new Blob([wavBytes.buffer as ArrayBuffer], { type: "audio/wav" }),
          offsetMs: Math.round((start / TARGET_SAMPLE_RATE) * 1000),
          endMs: Math.round((end / TARGET_SAMPLE_RATE) * 1000),
          ext: "wav",
        });
      }
      if (chunks.length > 0) return chunks;
    } catch {
      /* fall back to raw blob below */
    } finally {
      try { await ctx?.close?.(); } catch { /* ignore */ }
    }
  }

  const ext = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : blob.type.includes("mpeg") ? "mp3" : "webm";
  return [{ blob, offsetMs: 0, endMs: 25_000, ext }];
}

function buildSarvamFormData(
  chunkBlob: Blob,
  ext: string,
  opts: { languageCode?: string; mode?: SarvamMode },
): FormData {
  const fd = new FormData();
  fd.append("file", chunkBlob, `speech.${ext}`);
  fd.append("model", "saaras:v3");
  fd.append("mode", opts.mode ?? "transcribe");
  fd.append("language_code", opts.languageCode || "unknown");
  return fd;
}

async function invokeSingleSarvamChunk(
  chunkBlob: Blob,
  ext: string,
  opts: { apiKey?: string; languageCode?: string; mode?: SarvamMode },
): Promise<Response> {
  const key = (opts.apiKey ?? getSarvamApiKey()).trim();
  const buildBody = () => buildSarvamFormData(chunkBlob, ext, opts);

  // the user's own key only: there is no shared key anywhere (free, no charges to anyone else)
  if (!key) return new Response(JSON.stringify({ error: "no key" }), { status: 401 });
  try {
    return await fetch(SARVAM_ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: buildBody(),
    });
  } catch {
    // Network/CORS fallback: same-origin /api/sarvam-stt pass-through (web build on Vercel only)
    return await fetch(VERCEL_PROXY_ENDPOINT, {
      method: "POST",
      headers: { "x-sarvam-key": key },
      body: buildBody(),
    });
  }
}

function describeSarvamError(status: number, bodyText: string, hadKey: boolean): string {
  if (!hadKey && (status === 401 || status === 404 || status === 405 || status === 501)) {
    return "No Sarvam API key configured yet. Paste your Sarvam api-subscription-key in Speech-to-Text settings (or use Free Browser Dictation).";
  }
  if (status === 401 || status === 403) {
    return `Sarvam AI rejected the API key (HTTP ${status}). Verify your api-subscription-key from dashboard.sarvam.ai.`;
  }
  if (status === 429) {
    return "Sarvam AI rate limit or credit quota reached (HTTP 429). Please retry in a moment.";
  }
  if (status === 422) {
    return `Sarvam AI could not process the audio format/length (HTTP 422): ${bodyText.slice(0, 140)}`;
  }
  return `Sarvam AI error (HTTP ${status}): ${bodyText.slice(0, 140) || "Unexpected response"}`;
}

/** Transcribe any audio Blob using Sarvam AI (`saaras:v3`) with automatic <=25s WAV chunking. */
export async function transcribeWithSarvam(
  blob: Blob,
  opts: {
    apiKey?: string;
    languageCode?: string;
    mode?: SarvamMode;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<SarvamTranscriptResult> {
  const key = (opts.apiKey ?? getSarvamApiKey()).trim();
  const chunks = await prepareAudioChunksForSarvam(blob);
  const segments: TranscriptSegment[] = [];
  let detectedLanguage: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    opts.onProgress?.(i, chunks.length);
    const ch = chunks[i];
    let res: Response;
    try {
      res = await invokeSingleSarvamChunk(ch.blob, ch.ext, {
        apiKey: key,
        languageCode: opts.languageCode,
        mode: opts.mode,
      });
    } catch (err) {
      throw new Error(
        key
          ? `Could not reach Sarvam AI (${err instanceof Error ? err.message : String(err)}). Check your internet connection.`
          : "No Sarvam API key configured. Paste your key in Speech-to-Text settings or use Browser Live Dictation.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(describeSarvamError(res.status, errText, Boolean(key)));
    }

    const data = (await res.json()) as { transcript?: string; language_code?: string };
    const text = (data.transcript ?? "").trim();
    if (data.language_code) detectedLanguage = data.language_code;
    if (text) {
      segments.push({ offsetMs: ch.offsetMs, endMs: ch.endMs, text });
    }
    opts.onProgress?.(i + 1, chunks.length);
  }

  return {
    transcript: segments.map((s) => s.text).join(" ").trim(),
    languageCode: detectedLanguage,
    segments,
  };
}

/** Live connectivity & auth probe against Sarvam AI (`saaras:v3`) using a 0.35s silent PCM WAV. */
export async function testSarvamConnection(
  explicitKey?: string,
): Promise<{ ok: boolean; status?: number; message: string }> {
  const key = (explicitKey ?? getSarvamApiKey()).trim();
  const wav = createSilentTestWav(350);
  try {
    const res = await invokeSingleSarvamChunk(wav, "wav", {
      apiKey: key,
      languageCode: "en-IN",
      mode: "transcribe",
    });
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: "Connected! Sarvam AI (saaras:v3) invoked successfully and your key is active.",
      };
    }
    const bodyText = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      message: describeSarvamError(res.status, bodyText, Boolean(key)),
    };
  } catch (err) {
    return {
      ok: false,
      message: key
        ? `Network error reaching api.sarvam.ai: ${err instanceof Error ? err.message : String(err)}`
        : "Paste your Sarvam api-subscription-key above first to test invoking Sarvam AI.",
    };
  }
}

/* ---- Free Browser Web Speech API (SpeechRecognition) Live Dictation ---- */

interface BrowserSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognitionInstance) | null {
  const g = globalThis as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function startBrowserDictation(opts: {
  lang?: string;
  onResult: (finalChunk: string, interimChunk: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): { stop: () => void } | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    opts.onError?.("Live browser speech recognition is not supported in this browser. Use Sarvam AI STT instead.");
    return null;
  }
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = opts.lang && opts.lang !== "unknown" ? opts.lang : "en-IN";
  rec.onresult = (ev) => {
    let finalTxt = "";
    let interimTxt = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalTxt += r[0].transcript + " ";
      else interimTxt += r[0].transcript;
    }
    opts.onResult(finalTxt, interimTxt);
  };
  rec.onerror = (ev) => {
    if (ev.error !== "aborted" && ev.error !== "no-speech") {
      opts.onError?.(`Speech recognition error: ${ev.error}`);
    }
  };
  rec.onend = () => opts.onEnd?.();
  rec.start();
  return { stop: () => { try { rec.stop(); } catch { /* ignore */ } } };
}
