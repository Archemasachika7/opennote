import { STRIDE, type Stroke } from "./model";
import { bbox, hitTest, lassoContains, pointInPolygon, type Box } from "./geometry";
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

/** Text boxes are drawn at 28 logical px; roughly how wide one character is. */
const CHAR_W = 15.5;
const LINE_H = 36;

/** The part of an object that shows something: for a text box, the area its words cover (top-left). */
export function contentBox(o: PageObject): Box {
  if (o.kind !== "textbox") return { x: o.x, y: o.y, w: o.w, h: o.h };
  const lines = (o.text ?? "").split(/\r?\n/);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { x: o.x, y: o.y, w: Math.min(o.w, longest * CHAR_W + 16), h: Math.min(Math.max(o.h, LINE_H), lines.length * LINE_H + 16) };
}

/** A lasso takes an object when it goes round the object's middle, or round the words of a text box. */
export function selectWithLasso(poly: number[], strokes: Iterable<Stroke>, objects: PageObject[]): Selection {
  const strokeIds: string[] = [];
  for (const s of strokes) if (lassoContains(poly, s)) strokeIds.push(s.id);
  const objectIds = objects.filter((o) => {
    if (pointInPolygon(poly, o.x + o.w / 2, o.y + o.h / 2)) return true;
    const c = contentBox(o);
    return o.kind === "textbox" && pointInPolygon(poly, c.x + c.w / 2, c.y + c.h / 2);
  }).map((o) => o.id);
  return { strokeIds, objectIds };
}

/** A tap with the lasso: the topmost text box, picture or tape under the point, else the stroke under it. */
export function selectAt(x: number, y: number, strokes: Stroke[], objects: PageObject[], radius: number): Selection | null {
  const inside = (b: Box) => x >= b.x - radius && x <= b.x + b.w + radius && y >= b.y - radius && y <= b.y + b.h + radius;
  const obj = [...objects].sort((a, b) => b.z - a.z).find((o) => inside(contentBox(o)));
  if (obj) return { strokeIds: [], objectIds: [obj.id] };
  const s = [...strokes].reverse().find((st) => hitTest(st, x, y, radius));
  return s ? { strokeIds: [s.id], objectIds: [] } : null;
}

export function selectionBox(strokes: Stroke[], objects: PageObject[]): Box | null {
  const boxes: Box[] = [...strokes.map((s) => bbox(s.points)), ...objects.map(contentBox)];
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = 8;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
