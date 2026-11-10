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

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSeg(a: Pt, b: Pt, p: Pt): boolean {
  return p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}

function segsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const o1 = orient(a1, a2, b1), o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1), o4 = orient(b1, b2, a2);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (Math.abs(o1) < 1e-6 && onSeg(a1, a2, b1)) return true;
  if (Math.abs(o2) < 1e-6 && onSeg(a1, a2, b2)) return true;
  if (Math.abs(o3) < 1e-6 && onSeg(b1, b2, a1)) return true;
  if (Math.abs(o4) < 1e-6 && onSeg(b1, b2, a2)) return true;
  return false;
}

/** Exact minimum distance between line segments (a1-a2) and (b1-b2). */
export function segSegDist(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  if (segsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(segDist(a1, b1, b2), segDist(a2, b1, b2), segDist(b1, a1, a2), segDist(b2, a1, a2));
}

export function hitTest(s: Stroke, x: number, y: number, radius: number): boolean {
  const n = count(s.points);
  const lim = radius + s.width / 2;
  const p = { x, y };
  if (n === 1) return Math.hypot(at(s.points, 0).x - x, at(s.points, 0).y - y) <= lim;
  for (let i = 1; i < n; i++) if (segDist(p, at(s.points, i - 1), at(s.points, i)) <= lim) return true;
  return false;
}

/** True when a swept polyline `path` (x, y pairs) comes within `radius` of any segment of `s`. */
export function hitsEraserPath(s: Stroke, path: number[], radius: number): boolean {
  const n = count(s.points);
  if (n === 0 || path.length < 2) return false;
  const lim = radius + s.width / 2;
  const pSegs: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    const a = { x: path[i], y: path[i + 1] };
    const b = i + 3 < path.length ? { x: path[i + 2], y: path[i + 3] } : a;
    pSegs.push([a, b]);
  }
  if (n === 1) {
    const p0 = at(s.points, 0);
    return pSegs.some(([a, b]) => segDist(p0, a, b) <= lim);
  }
  for (let i = 1; i < n; i++) {
    const s0 = at(s.points, i - 1), s1 = at(s.points, i);
    for (const [a, b] of pSegs) {
      if (segSegDist(s0, s1, a, b) <= lim) return true;
    }
  }
  return false;
}

/** Densify long straight segments (such as sparse geometric shapes) so partial erasing cuts cleanly. */
function densifyPoints(points: Float32Array, maxStep = 5): Float32Array {
  const n = count(points);
  if (n < 2) return points;
  let needs = false;
  for (let i = 1; i < n; i++) {
    const dx = points[i * STRIDE] - points[(i - 1) * STRIDE];
    const dy = points[i * STRIDE + 1] - points[(i - 1) * STRIDE + 1];
    if (Math.hypot(dx, dy) > maxStep * 2) { needs = true; break; }
  }
  if (!needs) return points;
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i * STRIDE], y0 = points[i * STRIDE + 1], p0 = points[i * STRIDE + 2], t0 = points[i * STRIDE + 3];
    const x1 = points[(i + 1) * STRIDE], y1 = points[(i + 1) * STRIDE + 1], p1 = points[(i + 1) * STRIDE + 2], t1 = points[(i + 1) * STRIDE + 3];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxStep));
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, p0 + (p1 - p0) * u, t0 + (t1 - t0) * u);
    }
  }
  const last = (n - 1) * STRIDE;
  out.push(points[last], points[last + 1], points[last + 2], points[last + 3]);
  return new Float32Array(out);
}

/** Remove points covered by the eraser path; returns the remaining fragments (new ids) or [s] if untouched. */
export function splitByEraser(s: Stroke, path: number[], radius: number): Stroke[] {
  if (!hitsEraserPath(s, path, radius)) return [s];
  const pts = densifyPoints(s.points);
  const n = count(pts);
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
    const p = at(pts, i);
    covered[i] = segs.some(([a, b]) => segDist(p, a, b) <= lim);
    any ||= covered[i];
  }
  if (!any) return [s];
  const out: Stroke[] = [];
  // Once a geometric shape is partially erased, remaining fragments become open strokes (preserving Straight Line feel via shape: "line" only if 2 pts, else plain stroke)
  const { shape: _droppedShape, ...baseStroke } = s;
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && !covered[i]) { if (start < 0) start = i; continue; }
    if (start >= 0 && i - start >= 2) {
      out.push({ ...baseStroke, id: newId(), points: pts.slice(start * STRIDE, i * STRIDE) });
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
export type SnapKind = "line" | "rect" | "ellipse" | "arrow" | "triangle";

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

function simplifyClosedPolygon(pts: Pt[], box: Box, targetSides: number): Pt[] | null {
  const diag = Math.hypot(box.w, box.h);
  if (diag < 16) return null;
  let simp = rdp(pts, diag * 0.065);
  if (Math.hypot(simp[0].x - simp[simp.length - 1].x, simp[0].y - simp[simp.length - 1].y) < diag * 0.18) {
    simp = simp.slice(0, -1);
  }
  let changed = true;
  while (changed && simp.length > targetSides) {
    changed = false;
    for (let i = 0; i < simp.length; i++) {
      const ang = angleAt(simp[(i - 1 + simp.length) % simp.length], simp[i], simp[(i + 1) % simp.length]);
      if (ang > 148) { simp.splice(i, 1); changed = true; break; }
    }
  }
  return simp.length === targetSides ? simp : null;
}

function asRect(pts: Pt[], box: Box): Pt[] | null {
  const simp = simplifyClosedPolygon(pts, box, 4);
  if (!simp) return null;
  for (let i = 0; i < 4; i++) {
    const ang = angleAt(simp[(i + 3) % 4], simp[i], simp[(i + 1) % 4]);
    if (Math.abs(ang - 90) > 26) return null;
  }
  // Snap axis-aligned rectangles cleanly when edges are within ~10 degrees of horizontal/vertical
  const xs = simp.map((p) => p.x), ys = simp.map((p) => p.y);
  const edgeAngles = simp.map((p, i) => {
    const q = simp[(i + 1) % 4];
    const deg = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) * (180 / Math.PI)) % 90;
    return Math.min(deg, 90 - deg);
  });
  if (edgeAngles.every((d) => d <= 12)) {
    const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
    return [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }, { x: l, y: t }];
  }
  return [...simp, simp[0]];
}

function asTriangle(pts: Pt[], box: Box): Pt[] | null {
  const simp = simplifyClosedPolygon(pts, box, 3);
  if (!simp) return null;
  for (let i = 0; i < 3; i++) {
    const ang = angleAt(simp[(i + 2) % 3], simp[i], simp[(i + 1) % 3]);
    if (ang < 18 || ang > 140) return null;
  }
  return [...simp, simp[0]];
}

function asEllipse(pts: Pt[], box: Box): Pt[] | null {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let rx = box.w / 2, ry = box.h / 2;
  if (rx < 4 || ry < 4) return null;
  const r = pts.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
  if (sd / mean >= 0.2 || Math.abs(mean - 1) > 0.26) return null;
  // Snap near-circles to a true circle
  if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.12) {
    const avg = (rx + ry) / 2;
    rx = avg;
    ry = avg;
  }
  return Array.from({ length: 65 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
  });
}

function asArrow(pts: Pt[]): Pt[] | null {
  const s = pts[0];
  let tipI = 0, far = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d > far) { far = d; tipI = i; } });
  if (tipI >= pts.length - 2 || tipI < 2 || far < 16) return null;
  const main = pts.slice(0, tipI + 1);
  const tail = pts.slice(tipI);
  const tip = pts[tipI];
  if (maxDev(main, s, tip) > far * 0.065) return null;
  if (pathLen(tail) > pathLen(pts) * 0.38) return null;
  const end = tail[tail.length - 1];
  const turn = angleAt(s, tip, end);
  if (turn > 72) return null;
  const back = Math.atan2(s.y - tip.y, s.x - tip.x);
  const len = Math.max(10, Math.min(far * 0.18, 38));
  const head = (da: number) => ({ x: tip.x + Math.cos(back + da) * len, y: tip.y + Math.sin(back + da) * len });
  return [s, tip, head(0.48), tip, head(-0.48)];
}

/** Recognise a hand-drawn line, rectangle, triangle, ellipse or arrow; null when unsure. */
export function snapShape(points: Float32Array): { kind: SnapKind; points: Float32Array } | null {
  const n = count(points);
  if (n < 3) return null;
  const pts = Array.from({ length: n }, (_, i) => at(points, i));
  const a = pts[0], b = pts[n - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord > 10 && maxDev(pts, a, b) < chord * 0.055) return { kind: "line", points: pack([a, b]) };
  const arrow = asArrow(pts);
  if (arrow) return { kind: "arrow", points: pack(arrow) };
  const box = bbox(points);
  const totalLen = pathLen(pts);
  if (chord < totalLen * 0.2) {
    const rect = asRect(pts, box);
    if (rect) return { kind: "rect", points: pack(rect) };
    const tri = asTriangle(pts, box);
    if (tri) return { kind: "triangle", points: pack(tri) };
    const ell = asEllipse(pts, box);
    if (ell) return { kind: "ellipse", points: pack(ell) };
  }
  return null;
}
