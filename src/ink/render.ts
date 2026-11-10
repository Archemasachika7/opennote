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

const VARIANTS: Record<Stroke["variant"], StrokeOptions> = {
  ball: { thinning: 0.1, smoothing: 0.5, streamline: 0.5 },
  fountain: { thinning: 0.7, smoothing: 0.6, streamline: 0.5 },
  brush: { thinning: 0.9, smoothing: 0.5, streamline: 0.4 },
};

export function strokeOptions(s: Pick<Stroke, "tool" | "variant" | "width">, realPressure: boolean): StrokeOptions {
  if (s.tool === "highlighter") return { size: s.width * 4, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false };
  return { size: s.width * 2, ...VARIANTS[s.variant], simulatePressure: !realPressure };
}

function toPairs(points: Float32Array): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < points.length; i += STRIDE) out.push([points[i], points[i + 1], points[i + 2]]);
  return out;
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
  const pairs = toPairs(s.points);
  const realPressure = pairs.some((p) => p[2] !== 0.5);
  const outline = getStroke(pairs, { ...strokeOptions(s, realPressure), last: true });
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
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
  ctx.fillStyle = resolveColor(s, paper);
  ctx.globalAlpha = (s.tool === "highlighter" ? 0.35 : 1) * alphaMul;
  ctx.fill(p);
  ctx.restore();
}
