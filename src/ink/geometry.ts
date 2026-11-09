import { STRIDE, type Stroke } from "./model";

export type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

const newId = () => crypto.randomUUID();
const count = (p: Float32Array) => p.length / STRIDE;
const at = (p: Float32Array, i: number): Pt => ({ x: p[i * STRIDE], y: p[i * STRIDE + 1] });

export function bbox(points: Float32Array): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < points.length; i += STRIDE) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]); y1 = Math.max(y1, points[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function mapPoints(s: Stroke, f: (x: number, y: number) => [number, number]): Stroke {
  const p = new Float32Array(s.points);
  for (let i = 0; i < p.length; i += STRIDE) [p[i], p[i + 1]] = f(p[i], p[i + 1]);
  return { ...s, points: p };
}
export const translate = (s: Stroke, dx: number, dy: number): Stroke => mapPoints(s, (x, y) => [x + dx, y + dy]);
export const scale = (s: Stroke, sx: number, sy: number, ox: number, oy: number): Stroke =>
  mapPoints(s, (x, y) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(s: Stroke, x: number, y: number, radius: number): boolean {
  const n = count(s.points);
  const lim = radius + s.width / 2;
  const p = { x, y };
  if (n === 1) return Math.hypot(at(s.points, 0).x - x, at(s.points, 0).y - y) <= lim;
  for (let i = 1; i < n; i++) if (segDist(p, at(s.points, i - 1), at(s.points, i)) <= lim) return true;
  return false;
}

/** Remove points covered by the eraser path; returns the remaining fragments (new ids) or [s] if untouched. */
export function splitByEraser(s: Stroke, path: number[], radius: number): Stroke[] {
  const n = count(s.points);
  const lim = radius + s.width / 2;
  const segs: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    const a = { x: path[i], y: path[i + 1] };
    const b = i + 3 < path.length ? { x: path[i + 2], y: path[i + 3] } : a;
    segs.push([a, b]);
  }
  const covered = new Array<boolean>(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const p = at(s.points, i);
    covered[i] = segs.some(([a, b]) => segDist(p, a, b) <= lim);
    any ||= covered[i];
  }
  if (!any) return [s];
  const out: Stroke[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && !covered[i]) { if (start < 0) start = i; continue; }
    if (start >= 0 && i - start >= 2) {
      out.push({ ...s, id: newId(), points: s.points.slice(start * STRIDE, i * STRIDE) });
    }
    start = -1;
  }
  return out;
}

function inside(poly: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function lassoContains(polygon: number[], s: Stroke): boolean {
  const n = count(s.points);
  let k = 0;
  for (let i = 0; i < n; i++) if (inside(polygon, s.points[i * STRIDE], s.points[i * STRIDE + 1])) k++;
  return n > 0 && k / n >= 0.8;
}

export const pointInPolygon = inside;

// ---------- shape snapping ----------
export type SnapKind = "line" | "rect" | "ellipse" | "arrow";

function pack(pts: Pt[]): Float32Array {
  const a = new Float32Array(pts.length * STRIDE);
  pts.forEach((p, i) => a.set([p.x, p.y, 0.5, 0], i * STRIDE));
  return a;
}
const pathLen = (pts: Pt[]) => pts.reduce((n, p, i) => (i ? n + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
const maxDev = (pts: Pt[], a: Pt, b: Pt) => pts.reduce((m, p) => Math.max(m, segDist(p, a, b)), 0);

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function angleAt(prev: Pt, p: Pt, next: Pt): number {
  const a = Math.atan2(prev.y - p.y, prev.x - p.x);
  const b = Math.atan2(next.y - p.y, next.x - p.x);
  let d = Math.abs(a - b) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

function asRect(pts: Pt[], box: Box): Pt[] | null {
  const diag = Math.hypot(box.w, box.h);
  let simp = rdp(pts, diag * 0.06);
  if (Math.hypot(simp[0].x - simp[simp.length - 1].x, simp[0].y - simp[simp.length - 1].y) < diag * 0.15) simp = simp.slice(0, -1);
  // drop nearly straight vertices (start may sit mid-edge)
  let changed = true;
  while (changed && simp.length > 4) {
    changed = false;
    for (let i = 0; i < simp.length; i++) {
      const ang = angleAt(simp[(i - 1 + simp.length) % simp.length], simp[i], simp[(i + 1) % simp.length]);
      if (ang > 150) { simp.splice(i, 1); changed = true; break; }
    }
  }
  if (simp.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const ang = angleAt(simp[(i + 3) % 4], simp[i], simp[(i + 1) % 4]);
    if (Math.abs(ang - 90) > 20) return null;
  }
  return [...simp, simp[0]];
}

function asEllipse(pts: Pt[], box: Box): Pt[] | null {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const rx = box.w / 2, ry = box.h / 2;
  if (rx < 4 || ry < 4) return null;
  const r = pts.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
  if (sd / mean >= 0.18 || Math.abs(mean - 1) > 0.25) return null;
  return Array.from({ length: 65 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
  });
}

function asArrow(pts: Pt[]): Pt[] | null {
  const s = pts[0];
  let tipI = 0, far = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d > far) { far = d; tipI = i; } });
  if (tipI >= pts.length - 2 || tipI < 2) return null;
  const main = pts.slice(0, tipI + 1);
  const tail = pts.slice(tipI);
  const tip = pts[tipI];
  if (maxDev(main, s, tip) > far * 0.04) return null;
  if (pathLen(tail) > pathLen(pts) * 0.3) return null;
  const end = tail[tail.length - 1];
  const turn = angleAt(s, tip, end);
  if (turn > 60) return null; // tail must fold back: angle between back-vector and tail < 60 => turn > 120
  const back = Math.atan2(s.y - tip.y, s.x - tip.x);
  const len = Math.min(far * 0.15, 40);
  const head = (da: number) => ({ x: tip.x + Math.cos(back + da) * len, y: tip.y + Math.sin(back + da) * len });
  return [s, tip, head(0.45), tip, head(-0.45)];
}

/** Recognise a hand-drawn line, rectangle, ellipse or arrow; null when unsure. */
export function snapShape(points: Float32Array): { kind: SnapKind; points: Float32Array } | null {
  const n = count(points);
  if (n < 3) return null;
  const pts = Array.from({ length: n }, (_, i) => at(points, i));
  const a = pts[0], b = pts[n - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord > 10 && maxDev(pts, a, b) < chord * 0.04) return { kind: "line", points: pack([a, b]) };
  const arrow = asArrow(pts);
  if (arrow) return { kind: "arrow", points: pack(arrow) };
  const box = bbox(points);
  if (chord < pathLen(pts) * 0.15) {
    const rect = asRect(pts, box);
    if (rect) return { kind: "rect", points: pack(rect) };
    const ell = asEllipse(pts, box);
    if (ell) return { kind: "ellipse", points: pack(ell) };
  }
  return null;
}
