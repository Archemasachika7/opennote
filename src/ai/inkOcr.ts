/**
 * Handwriting → text and handwritten maths → LaTeX, on this device. Strokes are drawn into clean
 * images (../ink/rasterize.ts) and read by open models in ./inkOcr.worker.ts. Ink never leaves the
 * device; the models download once (cached by the browser) and then work offline.
 */
import { useSyncExternalStore } from "react";
import type { Stroke } from "../ink/model";
import { STRIDE } from "../ink/model";
import { textImages, writingStrokes, type Raster } from "../ink/rasterize";
import type { InkOnStroke } from "./inkOcr.worker";

export type InkKind = "text" | "math";

/* ---- worker client ---- */

type Msg = { id: number; type: "status" | "result" | "error"; status?: string; texts?: string[]; message?: string };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (t: string[]) => void; reject: (e: Error) => void; onStatus?: (s: string) => void }>();

type Payload = { kind: "text"; images: Raster[] } | { kind: "math"; formulas: InkOnStroke[][] };

function run(payload: Payload, onStatus?: (s: string) => void): Promise<string[]> {
  if (!worker) {
    worker = new Worker(new URL("./inkOcr.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Msg>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      if (e.data.type === "status") { job.onStatus?.(e.data.status ?? ""); return; }
      pending.delete(e.data.id);
      if (e.data.type === "result") job.resolve(e.data.texts ?? []);
      else job.reject(new Error(e.data.message ?? "Recognition failed."));
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus });
    const transfer = payload.kind === "text" ? payload.images.map((i) => i.data.buffer) : [];
    worker!.postMessage({ id, ...payload }, transfer);
  });
}

/* ---- tidy the models' output ---- */

/** TrOCR (trained on IAM lines) likes to end every piece with a full stop; drop the ones it invents. */
export function cleanPiece(t: string): string {
  return t.trim().replace(/\s+/g, " ").replace(/(?<![.!?])\s*\.$/, "").replace(/^[.,]\s*/, "");
}

/** pix2text writes LaTeX with a space between every token: `x ^ { 2 }` → `x^{2}`. */
export function normalizeLatex(t: string): string {
  let out = t.trim()
    .replace(/\s*([{}^_])\s*/g, "$1")
    .replace(/\s*([=+\-<>,()|[\]])\s*/g, "$1");
  // handwriting is never meant to be bold: \mathbf{E} → E
  for (let i = 0; i < 4; i++) out = out.replace(/\\(?:mathbf|boldsymbol|bm)\{([^{}]*)\}/g, "$1");
  return out
    .replace(/\s+/g, " ")
    .replace(/([=+<>])/g, " $1 ").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

/** Join recognised pieces back into lines (pieces of one line with spaces, lines with newlines). */
export function joinPieces(texts: string[], lineOf: number[]): string {
  const lines: string[][] = [];
  texts.forEach((t, i) => { const c = cleanPiece(t); if (c) (lines[lineOf[i]] ??= []).push(c); });
  return lines.filter(Boolean).map((l) => l.join(" ")).join("\n");
}

/** Read handwriting. Returns plain text, one line per written line. */
export async function recognizeText(strokes: Stroke[], onStatus?: (s: string) => void): Promise<string> {
  const { images, lineOf } = textImages(strokes);
  if (images.length === 0) return "";
  return joinPieces(await run({ kind: "text", images }, onStatus), lineOf);
}

/** Pen points for the maths model (it reads strokes, not pictures; it draws its own fixed-width lines). */
export function toInkOn(strokes: Stroke[]): InkOnStroke[] {
  return writingStrokes(strokes).map((st) => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < st.points.length; i += STRIDE) points.push({ x: st.points[i], y: st.points[i + 1] });
    return { points, lineWidth: 3 };
  });
}

/** Read a handwritten formula. Returns LaTeX. */
export async function recognizeMath(strokes: Stroke[], onStatus?: (s: string) => void): Promise<string> {
  const formula = toInkOn(strokes);
  if (formula.length === 0) return "";
  const [latex] = await run({ kind: "math", formulas: [formula] }, onStatus);
  return normalizeLatex(latex ?? "");
}

/* ---- "convert this selection" requests from the lasso toolbar ---- */

export type RecognizeRequest = { kind: InkKind; pageId: string; strokes: Stroke[]; /** where the ink is (logical page units) */ box?: { x: number; y: number; w: number; h: number } };
const reqSubs = new Set<(r: RecognizeRequest) => void>();
export function requestRecognize(r: RecognizeRequest): void { reqSubs.forEach((f) => f(r)); }
export function onRecognizeRequest(f: (r: RecognizeRequest) => void): () => void { reqSubs.add(f); return () => { reqSubs.delete(f); }; }

/* ---- "make my handwriting searchable" (off by default: it downloads a model) ---- */

const KEY = "opennote.inkSearch";
const subs = new Set<() => void>();
let inkSearch = (() => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } })();
export const getInkSearch = (): boolean => inkSearch;
export function setInkSearch(on: boolean): void {
  inkSearch = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const useInkSearch = (): boolean =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getInkSearch, getInkSearch);
