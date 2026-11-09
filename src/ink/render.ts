import { getStroke, type StrokeOptions } from "perfect-freehand";
import { STRIDE, type Stroke } from "./model";
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

/** Outline polygon of a stroke as a Path2D. A pressure of exactly 0.5 everywhere is treated as "no pressure". */
export function strokePath(s: Stroke): Path2D {
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

export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, paper: Paper, path: Path2D = strokePath(s)): void {
  ctx.save();
  ctx.fillStyle = resolveColor(s, paper);
  ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
  ctx.fill(path);
  ctx.restore();
}
