/**
 * Turn ink into images a handwriting / maths recognizer can read: group strokes into text lines, split
 * long lines at word gaps, and draw each piece the way the models were trained (IAM-style: dark ink on
 * white, tightly cropped, ~64 px tall, ~3 px pen). Grouping is pure and testable; drawing needs a canvas.
 */
import { STRIDE, type Stroke } from "./model";
import { bbox } from "./geometry";
import { paintStroke } from "./render";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Placed = { s: Stroke; b: Box };
export type Line = { strokes: Placed[]; b: Box };

const LINE_PX = 64;
const PAD = 10;
const MAX_CHUNK_ASPECT = 9; // TrOCR squeezes each image to a square: keep pieces short enough to stay legible

const boxOf = (s: Stroke): Box => { const r = bbox(s.points); return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }; };
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const h = (b: Box) => b.y1 - b.y0;
const cy = (b: Box) => (b.y0 + b.y1) / 2;

/** Strokes that are writing (not shapes, highlighter or empty). */
export const writingStrokes = (list: Stroke[]): Stroke[] =>
  list.filter((s) => !s.shape && s.tool !== "highlighter" && s.points.length >= STRIDE);

/**
 * Group strokes into text lines, top to bottom. Tall strokes found the lines; small ones (dots,
 * accents, commas) then join the nearest line, so an i-dot doesn't become a line of its own.
 */
export function groupLines(list: Stroke[]): Line[] {
  const placed = writingStrokes(list).map((s) => ({ s, b: boxOf(s) }));
  if (placed.length === 0) return [];
  const heights = placed.map((p) => h(p.b)).sort((a, b) => a - b);
  const median = Math.max(4, heights[Math.floor(heights.length / 2)]);
  const big = placed.filter((p) => h(p.b) >= median * 0.4);
  const small = placed.filter((p) => h(p.b) < median * 0.4);
  const lines: Line[] = [];
  for (const p of [...big].sort((a, b) => cy(a.b) - cy(b.b))) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.b.y1, p.b.y1) - Math.max(l.b.y0, p.b.y0);
      return overlap >= 0.45 * Math.min(h(p.b), h(l.b));
    });
    if (line) { line.strokes.push(p); line.b = union(line.b, p.b); } else lines.push({ strokes: [p], b: { ...p.b } });
  }
  for (const p of small) {
    let best: Line | null = null, d = Infinity;
    for (const l of lines) {
      const dy = Math.abs(cy(l.b) - cy(p.b));
      if (dy < d) { d = dy; best = l; }
    }
    if (best && d < Math.max(h(best.b), median) * 1.2) { best.strokes.push(p); best.b = union(best.b, p.b); }
    else lines.push({ strokes: [p], b: { ...p.b } });
  }
  return lines.sort((a, b) => a.b.y0 - b.b.y0);
}

/** Words of a line, left to right: runs of strokes separated by a gap wider than ~half the line height. */
export function splitWords(line: Line): Line[] {
  const lh = Math.max(12, h(line.b));
  const xs = [...line.strokes].sort((a, b) => a.b.x0 - b.b.x0);
  const words: Line[] = [];
  for (const p of xs) {
    const w = words[words.length - 1];
    if (w && p.b.x0 - w.b.x1 < lh * 0.45) { w.strokes.push(p); w.b = union(w.b, p.b); } else words.push({ strokes: [p], b: { ...p.b } });
  }
  return words;
}

/** Split a line into pieces at word gaps so no piece is too long for the recognizer. */
export function chunkLine(line: Line): Line[] {
  const lh = Math.max(12, h(line.b));
  const words = splitWords(line);
  const chunks: Line[] = [];
  for (const w of words) {
    const c = chunks[chunks.length - 1];
    const merged = c ? union(c.b, w.b) : w.b;
    if (c && (merged.x1 - merged.x0) <= lh * MAX_CHUNK_ASPECT) { c.strokes.push(...w.strokes); c.b = merged; }
    else chunks.push({ strokes: [...w.strokes], b: { ...w.b } });
  }
  return chunks;
}

export type Raster = { width: number; height: number; data: Uint8ClampedArray };

/** Draw strokes black-on-white, scaled so `targetH` px covers `refHeight` logical units. */
export function drawStrokes(strokes: Stroke[], b: Box, refHeight: number, targetH = LINE_PX): Raster | null {
  const k = targetH / Math.max(12, refHeight);
  const width = Math.max(16, Math.round((b.x1 - b.x0) * k + PAD * 2));
  const height = Math.max(16, Math.round((b.y1 - b.y0) * k + PAD * 2));
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  c.width = width; c.height = height;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(k, 0, 0, k, PAD - b.x0 * k, PAD - b.y0 * k);
  // normalise the pen: every stroke ~3 px, plain ballpoint, near-black, whatever was used on the page
  const penW = 1.6 / k;
  for (const s of strokes) paintStroke(ctx, { ...s, tool: "pen", variant: "ball", color: "#202020", paletteIndex: undefined, width: penW }, "light");
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** Images for text recognition: one per line piece, plus how pieces map back to lines. */
export function textImages(list: Stroke[]): { images: Raster[]; lineOf: number[] } {
  const images: Raster[] = [];
  const lineOf: number[] = [];
  groupLines(list).forEach((line, li) => {
    const lh = h(line.b);
    for (const piece of chunkLine(line)) {
      const r = drawStrokes(piece.strokes.map((p) => p.s), { ...piece.b, y0: line.b.y0, y1: line.b.y1 }, lh);
      if (r) { images.push(r); lineOf.push(li); }
    }
  });
  return { images, lineOf };
}

/** One image of a whole formula. */
export function mathImage(list: Stroke[]): Raster | null {
  const ws = writingStrokes(list);
  if (ws.length === 0) return null;
  const b = ws.map(boxOf).reduce(union);
  // aim for ~96 px tall, but keep very wide formulas within ~1000 px
  const refH = Math.max(h(b), (b.x1 - b.x0) / 10);
  return drawStrokes(ws, b, refH, 96);
}
