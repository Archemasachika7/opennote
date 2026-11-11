/**
 * Tidy handwriting: keep the person's own strokes but fix how they sit on the page. Works line by line
 * (same grouping as recognition): level the baseline, upright the slant, even out word sizes and the gaps
 * between words, and smooth hand tremor. Pure: strokes in, new strokes (same ids) out.
 * `strength` 0..1 blends from "as written" to "fully tidied", so a slider can preview it live.
 */
import { STRIDE, type Stroke } from "./model";
import { groupLines, splitWords, type Line } from "./rasterize";

export type TidyOptions = { straighten: boolean; slant: boolean; size: boolean; spacing: boolean; smooth: boolean };
export const ALL_TIDY: TidyOptions = { straighten: true, slant: true, size: true, spacing: true, smooth: true };

type Pts = Map<string, Float32Array>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, r) => p - r);
  const i = clamp(q, 0, 1) * (a.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const median = (xs: number[]) => quantile(xs, 0.5);

function coords(pts: Pts, ids: string[], axis: 0 | 1): number[] {
  const out: number[] = [];
  for (const id of ids) { const p = pts.get(id)!; for (let i = axis; i < p.length; i += STRIDE) out.push(p[i]); }
  return out;
}
function mapXY(pts: Pts, ids: string[], f: (x: number, y: number) => [number, number]): void {
  for (const id of ids) {
    const p = pts.get(id)!;
    for (let i = 0; i < p.length; i += STRIDE) [p[i], p[i + 1]] = f(p[i], p[i + 1]);
  }
}
/** Height of a word's letter bodies, ignoring the tallest ascenders and deepest descenders. */
const bodyHeight = (pts: Pts, ids: string[]) => { const ys = coords(pts, ids, 1); return quantile(ys, 0.85) - quantile(ys, 0.15); };
/** Words big enough to be letters (not a comma or an i-dot on its own). */
function realWords(pts: Pts, words: string[][]): { ids: string[]; bh: number }[] {
  const all = words.map((ids) => ({ ids, bh: bodyHeight(pts, ids) }));
  const ref = median(all.map((w) => w.bh));
  return all.filter((w) => w.bh >= ref * 0.35 && w.bh > 0);
}

/** Rotate the line so it runs level, then move each word up or down onto the shared middle line. */
function straighten(pts: Pts, ids: string[], words: string[][], k: number): void {
  const xs = coords(pts, ids, 0), ys = coords(pts, ids, 1);
  const n = xs.length;
  if (n >= 4) {
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    // only trust a slope from a line that is clearly longer than it is tall
    if (sxx > 0 && width > height * 2) {
      const a = -clamp(Math.atan(sxy / sxx), -0.45, 0.45) * k;
      const c = Math.cos(a), s = Math.sin(a);
      mapXY(pts, ids, (x, y) => [mx + (x - mx) * c - (y - my) * s, my + (x - mx) * s + (y - my) * c]);
    }
  }
  const ws = realWords(pts, words);
  if (ws.length < 2) return;
  const mids = ws.map((w) => median(coords(pts, w.ids, 1)));
  const target = median(mids);
  ws.forEach((w, i) => { const dy = (target - mids[i]) * k; mapXY(pts, w.ids, (x, y) => [x, y + dy]); });
}

/** Average lean of the near-vertical pen movements: dx per unit of dy (0 = upright, <0 = leans right). */
export function measureSlant(points: Float32Array[], step: number): number | null {
  let sum = 0, weight = 0;
  for (const p of points) {
    let ax = p[0], ay = p[1];
    for (let i = STRIDE; i < p.length; i += STRIDE) {
      const dx = p[i] - ax, dy = p[i + 1] - ay;
      if (Math.hypot(dx, dy) < step) continue;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) { sum += (dx / dy) * Math.abs(dy); weight += Math.abs(dy); }
      ax = p[i]; ay = p[i + 1];
    }
  }
  return weight > 0 ? sum / weight : null;
}

/** Shear the line so its letters stand upright. */
function deslant(pts: Pts, ids: string[], words: string[][], k: number): void {
  const ws = realWords(pts, words);
  const bh = median(ws.map((w) => w.bh)) || 10;
  const slant = measureSlant(ids.map((id) => pts.get(id)!), Math.max(1.5, bh * 0.12));
  if (slant === null || Math.abs(slant) < 0.03) return;
  const s = clamp(slant, -0.8, 0.8) * k;
  const cy = median(coords(pts, ids, 1));
  mapXY(pts, ids, (x, y) => [x - s * (y - cy), y]);
}

/** Scale each word so its letter bodies match the line's typical size. */
function evenSize(pts: Pts, words: string[][], k: number): void {
  const ws = realWords(pts, words);
  if (ws.length < 2) return;
  const target = median(ws.map((w) => w.bh));
  for (const w of ws) {
    const f = 1 + (clamp(target / w.bh, 0.7, 1.4) - 1) * k;
    if (Math.abs(f - 1) < 0.01) continue;
    const xs = coords(pts, w.ids, 0);
    const ax = (Math.min(...xs) + Math.max(...xs)) / 2, ay = median(coords(pts, w.ids, 1));
    mapXY(pts, w.ids, (x, y) => [ax + (x - ax) * f, ay + (y - ay) * f]);
  }
}

/** Make the gaps between words in a line equal (the first word stays put). */
function evenSpacing(pts: Pts, words: string[][], k: number): void {
  const spans = words.map((ids) => { const xs = coords(pts, ids, 0); return { ids, x0: Math.min(...xs), x1: Math.max(...xs) }; })
    .sort((a, b) => a.x0 - b.x0);
  if (spans.length < 3) return;
  const gaps = spans.slice(1).map((w, i) => w.x0 - spans[i].x1);
  const target = median(gaps);
  let shift = 0;
  for (let i = 1; i < spans.length; i++) {
    shift += (target - gaps[i - 1]) * k;
    const dx = shift;
    if (dx !== 0) mapXY(pts, spans[i].ids, (x, y) => [x + dx, y]);
  }
}

/** Smooth tremor: [1 2 1] passes over positions, leaving the ends and sharp corners where they are. */
export function smoothPoints(p: Float32Array, k: number): void {
  const n = p.length / STRIDE;
  const passes = Math.round(clamp(k, 0, 1) * 3);
  if (n < 3) return;
  for (let pass = 0; pass < passes; pass++) {
    const src = Float32Array.from(p);
    for (let j = 1; j < n - 1; j++) {
      const a = (j - 1) * STRIDE, b = j * STRIDE, c = (j + 1) * STRIDE;
      const ux = src[b] - src[a], uy = src[b + 1] - src[a + 1], vx = src[c] - src[b], vy = src[c + 1] - src[b + 1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) < 0.3) continue; // a corner (> ~73°): keep it sharp
      p[b] = (src[a] + 2 * src[b] + src[c]) / 4;
      p[b + 1] = (src[a + 1] + 2 * src[b + 1] + src[c + 1]) / 4;
    }
  }
}

/**
 * A line that drifts uphill or downhill can come out of groupLines as several pieces side by side.
 * Join pieces that follow each other left to right and sit within about a line height, so the whole
 * line is levelled together. Lines stacked in a paragraph overlap horizontally, so they stay apart.
 */
export function joinDriftingLines(lines: Line[]): Line[] {
  const out = lines.map((l) => ({ strokes: [...l.strokes], b: { ...l.b } }));
  const hh = (l: Line) => l.b.y1 - l.b.y0;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = 0; j < out.length && !merged; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        const lh = Math.max(hh(a), hh(b), 8);
        const xOverlap = Math.min(a.b.x1, b.b.x1) - Math.max(a.b.x0, b.b.x0);
        const gap = b.b.x0 - a.b.x1; // b starts after a ends
        const vGap = Math.max(a.b.y0, b.b.y0) - Math.min(a.b.y1, b.b.y1); // < 0 when they overlap vertically
        if (b.b.x0 >= a.b.x0 && xOverlap < lh * 0.3 && gap < lh * 3 && vGap < lh * 0.6) {
          a.strokes.push(...b.strokes);
          a.b = { x0: Math.min(a.b.x0, b.b.x0), y0: Math.min(a.b.y0, b.b.y0), x1: Math.max(a.b.x1, b.b.x1), y1: Math.max(a.b.y1, b.b.y1) };
          out.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return out;
}

/**
 * Tidied copies of the handwriting in `list` (shapes and highlighter are left alone and not returned).
 * Returns [] when there is nothing to change.
 */
export function tidyStrokes(list: Stroke[], strength: number, opts: TidyOptions = ALL_TIDY): Stroke[] {
  const k = clamp(strength, 0, 1);
  if (k === 0) return [];
  const lines = joinDriftingLines(groupLines(list));
  if (lines.length === 0) return [];
  const pts: Pts = new Map();
  for (const l of lines) for (const p of l.strokes) pts.set(p.s.id, Float32Array.from(p.s.points));
  for (const line of lines) {
    const ids = line.strokes.map((p) => p.s.id);
    const words = splitWords(line).map((w) => w.strokes.map((p) => p.s.id));
    if (opts.straighten) straighten(pts, ids, words, k);
    if (opts.slant) deslant(pts, ids, words, k);
    if (opts.size) evenSize(pts, words, k);
    if (opts.spacing) evenSpacing(pts, words, k);
  }
  if (opts.smooth) for (const p of pts.values()) smoothPoints(p, k);
  return list.filter((s) => pts.has(s.id)).map((s) => ({ ...s, points: pts.get(s.id)! }));
}
