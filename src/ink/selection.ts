import { STRIDE, type Stroke } from "./model";
import { bbox, lassoContains, pointInPolygon, type Box } from "./geometry";
import type { PageObject } from "../store/schema";

export type Selection = { strokeIds: string[]; objectIds: string[] };
/** Similarity transform about (cx, cy): scale k, rotate r (radians), then translate dx, dy. */
export type Xf = { dx: number; dy: number; k: number; r: number; cx: number; cy: number };
export const IDENTITY: Xf = { dx: 0, dy: 0, k: 1, r: 0, cx: 0, cy: 0 };

export function applyXf(x: number, y: number, m: Xf): [number, number] {
  const ux = (x - m.cx) * m.k;
  const uy = (y - m.cy) * m.k;
  const c = Math.cos(m.r);
  const s = Math.sin(m.r);
  return [m.cx + ux * c - uy * s + m.dx, m.cy + ux * s + uy * c + m.dy];
}

export function xfStroke(st: Stroke, m: Xf): Stroke {
  const p = new Float32Array(st.points);
  for (let i = 0; i < p.length; i += STRIDE) [p[i], p[i + 1]] = applyXf(p[i], p[i + 1], m);
  return { ...st, points: p, width: st.width * m.k };
}

export function xfObject(o: PageObject, m: Xf): PageObject {
  const [cx, cy] = applyXf(o.x + o.w / 2, o.y + o.h / 2, m);
  const w = o.w * m.k;
  const h = o.h * m.k;
  return { ...o, x: cx - w / 2, y: cy - h / 2, w, h, rotation: o.rotation + (m.r * 180) / Math.PI };
}

export function selectWithLasso(poly: number[], strokes: Iterable<Stroke>, objects: PageObject[]): Selection {
  const strokeIds: string[] = [];
  for (const s of strokes) if (lassoContains(poly, s)) strokeIds.push(s.id);
  const objectIds = objects.filter((o) => pointInPolygon(poly, o.x + o.w / 2, o.y + o.h / 2)).map((o) => o.id);
  return { strokeIds, objectIds };
}

export function selectionBox(strokes: Stroke[], objects: PageObject[]): Box | null {
  const boxes: Box[] = [...strokes.map((s) => bbox(s.points)), ...objects.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }))];
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = 8;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
