import { useSyncExternalStore } from "react";
import { STRIDE } from "./model";

/** A ruler placed on screen (client px). angle in degrees, clockwise from horizontal. */
export interface Ruler { cx: number; cy: number; angle: number; length: number; thickness: number }
/** One straight drawing edge, as a segment. */
export interface RulerLine { x0: number; y0: number; x1: number; y1: number }

const SNAP_WITHIN = 2;

/** Snap to the nearest multiple of 15 degrees when within 2 degrees; otherwise keep the angle. */
export function snapAngle(a: number): number {
  const near = Math.round(a / 15) * 15;
  return Math.abs(a - near) <= SNAP_WITHIN ? near : a;
}

/** The two long edges of a ruler, in the same units as the ruler. */
export function rulerEdges(r: Ruler): [RulerLine, RulerLine] {
  const t = (r.angle * Math.PI) / 180;
  const ux = Math.cos(t), uy = Math.sin(t);
  const nx = -uy, ny = ux;
  const hl = r.length / 2, ht = r.thickness / 2;
  const edge = (side: number): RulerLine => ({
    x0: r.cx - ux * hl + nx * ht * side, y0: r.cy - uy * hl + ny * ht * side,
    x1: r.cx + ux * hl + nx * ht * side, y1: r.cy + uy * hl + ny * ht * side,
  });
  return [edge(-1), edge(1)];
}

function distToLine(px: number, py: number, l: RulerLine): number {
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((px - l.x0) * dy - (py - l.y0) * dx) / len;
}

/**
 * If the stroke starts within `within` of an edge, put every point on that edge (keeping
 * pressure and time). Returns null when no edge is close enough.
 */
export function snapToRuler(points: Float32Array, lines: RulerLine[], within: number): Float32Array | null {
  if (points.length < STRIDE) return null;
  const x = points[0], y = points[1];
  let best: RulerLine | null = null;
  let bestD = within;
  for (const l of lines) {
    const d = distToLine(x, y, l);
    if (d <= bestD) { best = l; bestD = d; }
  }
  if (!best) return null;
  const dx = best.x1 - best.x0, dy = best.y1 - best.y0;
  const len2 = dx * dx + dy * dy || 1;
  const out = new Float32Array(points);
  for (let i = 0; i < out.length; i += STRIDE) {
    const k = ((out[i] - best.x0) * dx + (out[i + 1] - best.y0) * dy) / len2;
    out[i] = best.x0 + k * dx;
    out[i + 1] = best.y0 + k * dy;
  }
  return out;
}

/* ---- shared on-screen ruler state ---- */
export const RULER_LENGTH = 640;
export const RULER_THICKNESS = 72;
/** Snap distance in screen px. */
export const RULER_SNAP_PX = 28;

let ruler: Ruler | null = null;
const subs = new Set<() => void>();
export function getRuler(): Ruler | null { return ruler; }
export function setRuler(r: Ruler | null): void { ruler = r; subs.forEach((f) => f()); }
export function useRuler(): Ruler | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getRuler);
}
