import { bbox, type Box } from "../ink/geometry";
import type { Stroke } from "../ink/model";

/** Board view: logical point (x, y) is at the top-left of the screen; zoom = screen px per logical unit. */
export interface View { x: number; y: number; zoom: number }
export const BOARD_MIN_ZOOM = 0.1;
export const BOARD_MAX_ZOOM = 4;

export const clampBoardZoom = (z: number): number => Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, z));

/** Zoom to `zoom`, keeping the logical point under screen point (sx, sy) where it is. */
export function zoomAt(v: View, zoom: number, sx: number, sy: number): View {
  const z = clampBoardZoom(zoom);
  const lx = v.x + sx / v.zoom;
  const ly = v.y + sy / v.zoom;
  return { x: lx - sx / z, y: ly - sy / z, zoom: z };
}

/** Pan by a screen-px delta (content follows the finger). */
export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom });

/** Union box of strokes and objects; null when the board is empty. */
export function contentBounds(strokes: Stroke[], objects: { x: number; y: number; w: number; h: number }[]): Box | null {
  const boxes: Box[] = [
    ...strokes.map((s) => { const b = bbox(s.points); const pad = s.width * 2; return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }),
    ...objects.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
  ];
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(a: Box, b: Box): Box {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
}

export const intersects = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** Scale + offset that fits `world` centred inside a w × h minimap. */
export function minimapFit(world: Box, w: number, h: number): { k: number; ox: number; oy: number } {
  const k = Math.min(w / Math.max(1, world.w), h / Math.max(1, world.h));
  return { k, ox: (w - world.w * k) / 2 - world.x * k, oy: (h - world.h * k) / 2 - world.y * k };
}

/** Visible logical rectangle of a view on a screen of size w × h. */
export const viewBox = (v: View, w: number, h: number): Box => ({ x: v.x, y: v.y, w: w / v.zoom, h: h / v.zoom });
