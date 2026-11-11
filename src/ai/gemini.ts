import { useSyncExternalStore } from "react";

/**
 * Gemini for notes: summaries and flashcards.
 *
 * Two engines, both opt-in:
 *  - "device": Gemini Nano built into Chrome (the Prompt API). Free, offline, nothing leaves the device. Only some
 *    desktop Chrome builds have it; Android WebViews (the APK) do not.
 *  - "cloud": the Gemini API with the user's own key from Google AI Studio. The notes' text is sent to Google.
 * "auto" uses the device when it can, otherwise the cloud if a key is set.
 */
export type AiEngine = "auto" | "device" | "cloud";
export interface GeminiPrefs { engine: AiEngine; model: string }
export type DeviceStatus = "available" | "downloadable" | "downloading" | "unavailable";

export const DEFAULT_MODEL = "gemini-flash-latest";
const API = "https://generativelanguage.googleapis.com/v1beta";
const KEY = "opennote.gemini.key";
const PREFS = "opennote.gemini.prefs";
/** Gemini Nano has a small context window; the cloud models take far more. */
export const DEVICE_MAX_CHARS = 12_000;
export const CLOUD_MAX_CHARS = 200_000;

const subs = new Set<() => void>();
let version = 0;
const bump = () => { version++; subs.forEach((f) => f()); };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

export function getGeminiKey(): string { return (read(KEY) ?? "").trim(); }
export function setGeminiKey(key: string): void { write(KEY, key.trim() || null); bump(); }
export function getGeminiPrefs(): GeminiPrefs {
  try {
    const p = JSON.parse(read(PREFS) ?? "{}") as Partial<GeminiPrefs>;
    return { engine: p.engine === "device" || p.engine === "cloud" ? p.engine : "auto", model: (p.model ?? "").trim() || DEFAULT_MODEL };
  } catch { return { engine: "auto", model: DEFAULT_MODEL }; }
}
export function setGeminiPrefs(patch: Partial<GeminiPrefs>): void { write(PREFS, JSON.stringify({ ...getGeminiPrefs(), ...patch })); bump(); }
export function useGeminiConfig(): { key: string; prefs: GeminiPrefs } {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
  return { key: getGeminiKey(), prefs: getGeminiPrefs() };
}

// ---- on-device (Chrome Prompt API) ----
interface LMSession { prompt(input: string, opts?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>; destroy(): void }
interface LMStatic {
  availability(opts?: object): Promise<DeviceStatus>;
  create(opts?: object): Promise<LMSession>;
}
const lm = (): LMStatic | undefined => (globalThis as unknown as { LanguageModel?: LMStatic }).LanguageModel;
const LM_OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

export async function deviceStatus(): Promise<DeviceStatus> {
  const L = lm();
  if (!L) return "unavailable";
  try { return await L.availability(LM_OPTS); } catch { return "unavailable"; }
}

export class AiSetupNeeded extends Error {}

/** Which engine will answer, or why none can. */
export async function pickEngine(prefs = getGeminiPrefs(), key = getGeminiKey()): Promise<"device" | "cloud"> {
  const dev = prefs.engine === "cloud" ? "unavailable" : await deviceStatus();
  if (prefs.engine === "device") {
    if (dev === "unavailable") throw new AiSetupNeeded("Gemini Nano isn't available in this browser. Choose Cloud or Auto in Settings.");
    return "device";
  }
  if (prefs.engine === "auto" && dev !== "unavailable") return "device";
  if (key) return "cloud";
  throw new AiSetupNeeded(prefs.engine === "cloud"
    ? "Add your Gemini API key in Settings to use the cloud."
    : "No on-device Gemini here. Add your own Gemini API key in Settings (free from Google AI Studio) to use the cloud.");
}

export interface AskOptions { system: string; prompt: string; schema?: object; signal?: AbortSignal; onStatus?: (s: string) => void }

async function askDevice(o: AskOptions): Promise<string> {
  const L = lm();
  if (!L) throw new AiSetupNeeded("Gemini Nano isn't available in this browser.");
  const session = await L.create({
    ...LM_OPTS,
    initialPrompts: [{ role: "system", content: o.system }],
    signal: o.signal,
    monitor(m: EventTarget) {
      m.addEventListener("downloadprogress", (e) => {
        const loaded = (e as unknown as { loaded?: number }).loaded ?? 0;
        o.onStatus?.(`Downloading Gemini Nano to this device... ${Math.round(loaded * 100)}%`);
      });
    },
  });
  try {
    o.onStatus?.("Thinking on this device...");
    return await session.prompt(o.prompt, { ...(o.schema ? { responseConstraint: o.schema } : {}), signal: o.signal });
  } finally {
    session.destroy();
  }
}

type GenResponse = { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string } };

async function callModel(model: string, key: string, o: AskOptions): Promise<Response> {
  return fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: o.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      ...(o.schema ? { generationConfig: { responseMimeType: "application/json", responseSchema: o.schema } } : {}),
    }),
  });
}

/** When the saved model name is gone (Google retires them often), pick the newest Flash model this key can use. */
export async function findFlashModel(key: string, signal?: AbortSignal): Promise<string | null> {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal });
  if (!r.ok) return null;
  const j = await r.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return pickFlash((j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, "")));
}

/** Newest plain "gemini-X.Y-flash" (not lite, image, audio, tts, live or preview builds). */
export function pickFlash(names: string[]): string | null {
  const ver = (n: string) => Number((/gemini-(\d+(?:\.\d+)?)-flash/.exec(n) ?? [])[1] ?? 0);
  const plain = names.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
  const pool = plain.length ? plain : names.filter((n) => /flash/.test(n) && !/(lite|image|audio|tts|live|embedding)/.test(n));
  return pool.sort((a, b) => ver(b) - ver(a))[0] ?? null;
}

async function askCloud(o: AskOptions, key: string): Promise<string> {
  let model = getGeminiPrefs().model;
  o.onStatus?.("Asking Gemini...");
  let r = await callModel(model, key, o);
  if (r.status === 404) {
    const found = await findFlashModel(key, o.signal);
    if (found && found !== model) {
      model = found;
      setGeminiPrefs({ model });
      r = await callModel(model, key, o);
    }
  }
  const j = await r.json().catch(() => ({})) as GenResponse;
  if (!r.ok) {
    const why = j.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 400 && /api key/i.test(why)) throw new AiSetupNeeded("Google didn't accept that Gemini API key. Check it in Settings.");
    if (r.status === 403) throw new AiSetupNeeded(`Google refused the request: ${why}`);
    if (r.status === 429) throw new Error("Gemini's free limit is used up for now. Try again in a minute.");
    throw new Error(`Gemini: ${why}`);
  }
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error(j.candidates?.[0]?.finishReason === "SAFETY" ? "Gemini declined to answer this one." : "Gemini sent back an empty answer.");
  return text;
}

export async function askGemini(o: AskOptions): Promise<{ text: string; engine: "device" | "cloud" }> {
  const engine = await pickEngine();
  const max = engine === "device" ? DEVICE_MAX_CHARS : CLOUD_MAX_CHARS;
  const prompt = o.prompt.length > max ? `${o.prompt.slice(0, max)}\n\n[...the rest was cut to fit]` : o.prompt;
  const text = engine === "device" ? await askDevice({ ...o, prompt }) : await askCloud({ ...o, prompt }, getGeminiKey());
  return { text, engine };
}

/** Quick check for Settings: is the key accepted? */
export async function testGeminiKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(`${API}/models?pageSize=1`, { headers: { "x-goog-api-key": key.trim() } });
    if (r.ok) return { ok: true, message: "Key works." };
    const j = await r.json().catch(() => ({})) as GenResponse;
    return { ok: false, message: j.error?.message ?? `Google answered ${r.status}.` };
  } catch (e) {
    return { ok: false, message: `Couldn't reach Google: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---- the two note tasks ----
const SUMMARY_SYSTEM = "You summarise a student's own notes. Be faithful to the notes: never add facts that are not in them. "
  + "Write plain text (no markdown symbols like ** or #). Start with one short sentence giving the gist, then 3 to 8 short bullet points "
  + "starting with \"- \" for the key ideas, definitions and formulas. If the notes are very short, keep the summary short.";

export async function summarizeNotes(text: string, what: string, opts: Pick<AskOptions, "signal" | "onStatus"> = {}) {
  return askGemini({ system: SUMMARY_SYSTEM, prompt: `Summarise ${what}:\n\n${text}`, ...opts });
}

export interface DraftCard { front: string; back: string }
const CARDS_SCHEMA = {
  type: "object",
  properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] } } },
  required: ["cards"],
};
const CARDS_SYSTEM = "You make study flashcards from a student's own notes. Only use facts that are in the notes. "
  + "Each card tests one idea: a clear question or term on the front, a short exact answer on the back (under 40 words). "
  + "Make between 3 and 15 cards depending on how much the notes cover. No duplicates. Answer as JSON: {\"cards\":[{\"front\":\"...\",\"back\":\"...\"}]}.";

/** Reads the cards out of the model's JSON (tolerating a ```json fence or text around it). */
export function parseCards(raw: string): DraftCard[] {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{"), startArr = s.indexOf("[");
  let data: unknown;
  try {
    data = JSON.parse(start >= 0 && (startArr < 0 || start < startArr) ? s.slice(start, s.lastIndexOf("}") + 1) : s.slice(startArr, s.lastIndexOf("]") + 1));
  } catch { return []; }
  const list = Array.isArray(data) ? data : (data as { cards?: unknown }).cards;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .map((c) => ({ front: String((c as DraftCard)?.front ?? "").trim(), back: String((c as DraftCard)?.back ?? "").trim() }))
    .filter((c) => c.front && c.back && !seen.has(c.front.toLowerCase()) && seen.add(c.front.toLowerCase()))
    .slice(0, 30);
}

export async function makeFlashcards(text: string, opts: Pick<AskOptions, "signal" | "onStatus"> = {}): Promise<{ cards: DraftCard[]; engine: "device" | "cloud" }> {
  const r = await askGemini({ system: CARDS_SYSTEM, prompt: `Make flashcards from these notes:\n\n${text}`, schema: CARDS_SCHEMA, ...opts });
  return { cards: parseCards(r.text), engine: r.engine };
}
