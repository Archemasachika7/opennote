import { getStroke, type StrokeOptions } from "perfect-freehand";
import { STRIDE, type Stroke } from "./model";
import { isClosedShape } from "./shapes";
import type { Paper } from "../store/schema";

const PALETTES: Record<Paper, string[]> = {
  dark: ["#E8E9EE", "#4FD1C5", "#3DDC97", "#FF9E6B", "#6CC4FF", "#F2C94C", "#FF8A8A", "#B4B7C3"],
  light: ["#16171C", "#0F766E", "#08704A", "#B5430F", "#1F5FBF", "#8A6100", "#C0262B", "#4A4D5A"],
};

/** 8 ink colours, each >= 4.5:1 contrast on the given paper. Index i means the same hue on both papers. */
export const inkPalette = (paper: Paper): string[] => PALETTES[paper];

export function resolveColor(s: Pick<Stroke, "color" | "paletteIndex">, paper: Paper): string {
  return s.paletteIndex !== undefined && s.paletteIndex !== null ? PALETTES[paper][s.paletteIndex] ?? s.color : s.color;
}

export function resolveFillColor(s: Pick<Stroke, "color" | "paletteIndex" | "shape">, paper: Paper): string {
  const sh = s.shape;
  if (sh?.fillPaletteIndex !== undefined && sh.fillPaletteIndex !== null) {
    return PALETTES[paper][sh.fillPaletteIndex] ?? sh.fillColor ?? resolveColor(s, paper);
  }
  if (sh?.fillColor) return sh.fillColor;
  return resolveColor(s, paper);
}

// Tuned for a paper-like feel (reMarkable / S Note): high smoothing so the outline has no corners,
// moderate streamline so wet ink still keeps up with the nib, gentle easing so width swells instead of jumping.
const easeSine = (t: number) => Math.sin((t * Math.PI) / 2);
const VARIANTS: Record<Stroke["variant"], StrokeOptions> = {
  ball: { thinning: 0.18, smoothing: 0.68, streamline: 0.58, easing: easeSine },
  fountain: { thinning: 0.62, smoothing: 0.7, streamline: 0.56, easing: easeSine },
  brush: { thinning: 0.82, smoothing: 0.7, streamline: 0.5, easing: easeSine },
  // graphite: a little pressure response, drawn with a grain texture (see paintStroke)
  pencil: { thinning: 0.35, smoothing: 0.66, streamline: 0.55, easing: easeSine },
  // felt tip: even width, round ends
  marker: { thinning: 0, smoothing: 0.72, streamline: 0.6 },
  // outline isn't used (a chisel nib is drawn by calligraphyPath); kept for the type
  calligraphy: { thinning: 0, smoothing: 0.7, streamline: 0.55 },
  // pressure comes from beautifyInput (nib direction + real pressure), so thinning is strong but not simulated
  beautify: { thinning: 0.72, smoothing: 0.85, streamline: 0.5, easing: easeSine },
};
const SIZE: Partial<Record<Stroke["variant"], number>> = { pencil: 1.5, marker: 3, beautify: 2.3 };

export function strokeOptions(s: Pick<Stroke, "tool" | "variant" | "width">, realPressure: boolean): StrokeOptions {
  if (s.tool === "highlighter") return { size: s.width * 4, thinning: 0, smoothing: 0.7, streamline: 0.62, simulatePressure: false };
  const size = s.width * (SIZE[s.variant] ?? 2);
  if (s.variant === "beautify") {
    return { size, ...VARIANTS.beautify, simulatePressure: false, start: { taper: size * 2.5 }, end: { taper: size * 4 } };
  }
  return { size, ...(VARIANTS[s.variant] ?? VARIANTS.ball), simulatePressure: !realPressure };
}

function toPairs(points: Float32Array): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < points.length; i += STRIDE) out.push([points[i], points[i + 1], points[i + 2]]);
  return out;
}

/** Input points closer than this (logical px) are digitizer jitter, not movement. */
const MIN_STEP = 0.6;

/**
 * Clean raw pen input before outlining, so a stroke reads as one continuous curve: drop sub-pixel
 * jitter, low-pass the pressure (digitizers report it noisily, which makes the width wobble and look
 * like joined segments), and run one gentle [1 2 1] pass over positions. The first and last points
 * stay exactly where the pen touched down and lifted. Pure, so wet ink and dry ink match.
 */
export function smoothInput(pairs: number[][]): number[][] {
  if (pairs.length < 3) return pairs;
  const kept: number[][] = [pairs[0]];
  for (let i = 1; i < pairs.length - 1; i++) {
    const p = pairs[i], q = kept[kept.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= MIN_STEP) kept.push(p);
  }
  kept.push(pairs[pairs.length - 1]);
  if (kept.length < 3) return kept;
  // pressure: moving average forward then backward, so the smoothed width doesn't lag behind the nib
  const pr = kept.map((p) => p[2]);
  const A = 0.35;
  for (let i = 1; i < pr.length; i++) pr[i] = pr[i - 1] + A * (pr[i] - pr[i - 1]);
  for (let i = pr.length - 2; i >= 0; i--) pr[i] = pr[i + 1] + A * (pr[i] - pr[i + 1]);
  const out: number[][] = [[kept[0][0], kept[0][1], pr[0]]];
  for (let i = 1; i < kept.length - 1; i++) {
    const a = kept[i - 1], b = kept[i], c = kept[i + 1];
    out.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4, pr[i]]);
  }
  const z = kept[kept.length - 1];
  out.push([z[0], z[1], pr[pr.length - 1]]);
  return out;
}

/** Nib angle for the Beautify pen: strokes across it are thick, strokes along it are hairlines. */
const BEAUTIFY_NIB = -Math.PI / 5;

/**
 * Beautify pen input (like S Note's Beautify pen): stronger smoothing than normal ink, keeping sharp
 * corners, then a pen-like thick-and-thin flow from the stroke direction, mixed with real pressure.
 */
export function beautifyInput(pairs: number[][]): number[][] {
  let pts = smoothInput(pairs);
  for (let pass = 0; pass < 2 && pts.length >= 3; pass++) {
    const src = pts;
    pts = src.map((b, i) => {
      if (i === 0 || i === src.length - 1) return b;
      const a = src[i - 1], c = src[i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) < 0.3) return b; // corner: keep it crisp
      return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4, b[2]];
    });
  }
  if (pts.length < 2) return pts;
  const real = pts.some((p) => p[2] !== 0.5);
  const w = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    const across = Math.abs(Math.sin(Math.atan2(c[1] - a[1], c[0] - a[0]) - BEAUTIFY_NIB));
    return 0.22 + 0.78 * (real ? 0.65 * across + 0.35 * p[2] : across);
  });
  // ease the width changes so thick and thin flow into each other
  for (let i = 1; i < w.length; i++) w[i] = w[i - 1] + 0.3 * (w[i] - w[i - 1]);
  for (let i = w.length - 2; i >= 0; i--) w[i] = w[i + 1] + 0.3 * (w[i] - w[i + 1]);
  return pts.map((p, i) => [p[0], p[1], w[i]]);
}

/**
 * A closed outline as one seamless curve: each vertex is the control point between the midpoints of
 * its two edges, wrapping around, so there's no straight seam (a visible "join") where it closes.
 */
export function outlinePath(outline: number[][], path: Path2D = new Path2D()): Path2D {
  const n = outline.length;
  if (n === 0) return path;
  if (n < 3) {
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < n; i++) path.lineTo(outline[i][0], outline[i][1]);
    path.closePath();
    return path;
  }
  const mid = (i: number) => {
    const a = outline[i % n], b = outline[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(0);
  path.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const v = outline[i % n], m = mid(i);
    path.quadraticCurveTo(v[0], v[1], m[0], m[1]);
  }
  path.closePath();
  return path;
}

/** Build an exact geometric polyline Path2D for a shape stroke. */
export function geometricShapePath(s: Stroke): Path2D {
  const path = new Path2D();
  const pts = s.points;
  const n = pts.length / STRIDE;
  if (n === 0) return path;
  if (s.shape?.kind === "arrow" && n >= 5) {
    // [start, tip, wing1, tip2, wing2]
    const sx = pts[0], sy = pts[1];
    const tx = pts[4], ty = pts[5];
    const w1x = pts[8], w1y = pts[9];
    const w2x = pts[16], w2y = pts[17];
    path.moveTo(sx, sy);
    path.lineTo(tx, ty);
    path.moveTo(w1x, w1y);
    path.lineTo(tx, ty);
    path.lineTo(w2x, w2y);
    return path;
  }
  path.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n; i++) path.lineTo(pts[i * STRIDE], pts[i * STRIDE + 1]);
  if (s.shape && isClosedShape(s.shape.kind)) path.closePath();
  return path;
}

/** Outline polygon of a stroke as a Path2D. A pressure of exactly 0.5 everywhere is treated as "no pressure". */
export function strokePath(s: Stroke): Path2D {
  if (s.shape) return geometricShapePath(s);
  const raw = toPairs(s.points);
  if (s.variant === "calligraphy" && s.tool !== "highlighter") return calligraphyPath(smoothInput(raw), s.width);
  if (s.variant === "beautify" && s.tool !== "highlighter") {
    return outlinePath(getStroke(beautifyInput(raw), { ...strokeOptions(s, true), last: true }));
  }
  const realPressure = raw.some((p) => p[2] !== 0.5);
  const outline = getStroke(smoothInput(raw), { ...strokeOptions(s, realPressure), last: true });
  return outlinePath(outline);
}

/** Chisel nib held at 45 degrees: thick on one diagonal, hairline on the other, like a broad-edge pen. */
const NIB_ANGLE = -Math.PI / 4;
export function calligraphyPath(pts: number[][], width: number): Path2D {
  const path = new Path2D();
  if (pts.length === 0) return path;
  const nx = Math.cos(NIB_ANGLE), ny = Math.sin(NIB_ANGLE);
  const half = (p: number[]) => width * 2.4 * (0.65 + 0.35 * (p[2] ?? 0.5) * 2) / 2;
  const quad = (a: number[][]) => {
    // every quad wound the same way, so overlapping pieces add up instead of punching holes (nonzero fill)
    let area = 0;
    for (let i = 0; i < 4; i++) { const p = a[i], q = a[(i + 1) % 4]; area += p[0] * q[1] - q[0] * p[1]; }
    const v = area < 0 ? [...a].reverse() : a;
    path.moveTo(v[0][0], v[0][1]);
    for (let i = 1; i < 4; i++) path.lineTo(v[i][0], v[i][1]);
    path.closePath();
  };
  if (pts.length === 1) {
    const [x, y] = pts[0], h = half(pts[0]), t = width * 0.4;
    quad([[x + nx * h, y + ny * h], [x + nx * h + t, y + ny * h + t], [x - nx * h + t, y - ny * h + t], [x - nx * h, y - ny * h]]);
    return path;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ha = half(a), hb = half(b);
    quad([[a[0] + nx * ha, a[1] + ny * ha], [b[0] + nx * hb, b[1] + ny * hb], [b[0] - nx * hb, b[1] - ny * hb], [a[0] - nx * ha, a[1] - ny * ha]]);
  }
  return path;
}

/** Graphite grain: a small tile of speckled alpha in the ink colour, cached per colour. */
const grain = new Map<string, CanvasPattern | null>();
function pencilPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  if (grain.has(color)) return grain.get(color)!;
  let pat: CanvasPattern | null = null;
  try {
    const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const g = c?.getContext("2d");
    if (c && g) {
      c.width = c.height = 48;
      g.fillStyle = color;
      // deterministic speckle (same texture every redraw, no shimmer)
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        g.globalAlpha = 0.45 + rnd() * 0.55 * (rnd() < 0.82 ? 1 : 0.2);
        g.fillRect(x, y, 1, 1);
      }
      pat = ctx.createPattern(c, "repeat");
      if (pat && typeof DOMMatrix !== "undefined") pat.setTransform?.(new DOMMatrix().scale(0.5));
    }
  } catch { pat = null; }
  grain.set(color, pat);
  return pat;
}

/** Paint a crisp vector geometric shape (bypassing freehand pressure simulation/corner rounding). */
function paintGeometricShape(ctx: CanvasRenderingContext2D, s: Stroke, paper: Paper, alphaMul = 1): void {
  const sh = s.shape!;
  const col = resolveColor(s, paper);
  const fillCol = resolveFillColor(s, paper);
  const lw = s.tool === "highlighter" ? s.width * 4 : s.width * 2;
  const baseAlpha = (s.tool === "highlighter" ? 0.38 : 1) * alphaMul;
  const pts = s.points;
  const n = pts.length / STRIDE;
  if (n < 2) return;

  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = fillCol;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (sh.kind === "arrow" && n >= 5) {
    const sx = pts[0], sy = pts[1];
    const tx = pts[4], ty = pts[5];
    const w1x = pts[8], w1y = pts[9];
    const w2x = pts[16], w2y = pts[17];
    ctx.globalAlpha = baseAlpha;
    if (sh.dashed) ctx.setLineDash([lw * 2.5, lw * 1.8]);
    // Shaft stops slightly short when filled arrowhead is used so tip stays razor-sharp
    const endX = sh.fill ? (w1x + w2x) / 2 : tx;
    const endY = sh.fill ? (w1y + w2y) / 2 : ty;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(w1x, w1y);
    ctx.lineTo(tx, ty);
    ctx.lineTo(w2x, w2y);
    if (sh.fill) {
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.globalAlpha = baseAlpha * (sh.fillOpacity !== undefined ? Math.max(0.75, sh.fillOpacity) : 1);
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = col;
      ctx.stroke();
    } else {
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const path = geometricShapePath(s);
  if (sh.fill && isClosedShape(sh.kind)) {
    const rawFillAlpha = sh.fillOpacity !== undefined
      ? sh.fillOpacity
      : s.tool === "highlighter" ? 0.28 : 0.42;
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = Math.max(0.05, Math.min(1, rawFillAlpha)) * alphaMul;
    ctx.fill(path);
  }
  if (sh.dashed) ctx.setLineDash([lw * 2.5, lw * 1.8]);
  ctx.strokeStyle = col;
  ctx.globalAlpha = baseAlpha;
  ctx.stroke(path);
  ctx.restore();
}

export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, paper: Paper, path?: Path2D, alphaMul = 1): void {
  if (s.shape) {
    paintGeometricShape(ctx, s, paper, alphaMul);
    return;
  }
  const p = path ?? strokePath(s);
  ctx.save();
  const col = resolveColor(s, paper);
  const pencil = s.variant === "pencil" && s.tool !== "highlighter";
  ctx.fillStyle = (pencil && pencilPattern(ctx, col)) || col;
  ctx.globalAlpha = (s.tool === "highlighter" ? 0.35 : pencil ? 0.92 : 1) * alphaMul;
  ctx.fill(p);
  ctx.restore();
}
