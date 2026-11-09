export type ShapeKind = "line" | "arrow" | "rect" | "roundrect" | "ellipse" | "triangle" | "diamond" | "star";

export const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "line", label: "Line" },
  { kind: "arrow", label: "Arrow" },
  { kind: "rect", label: "Rectangle" },
  { kind: "roundrect", label: "Rounded rectangle" },
  { kind: "ellipse", label: "Ellipse / circle" },
  { kind: "triangle", label: "Triangle" },
  { kind: "diamond", label: "Diamond" },
  { kind: "star", label: "Star" },
];

type P = [number, number];
const pack = (pts: P[]): Float32Array => {
  const a = new Float32Array(pts.length * 4);
  pts.forEach(([x, y], i) => a.set([x, y, 0.5, 0], i * 4));
  return a;
};

/** Points of a predefined shape dragged from (x0,y0) to (x1,y1). `even` (Shift) keeps width = height. */
export function shapePoints(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number, even: boolean): Float32Array {
  if (kind === "line" || kind === "arrow") {
    if (even) {
      // snap to 45 degree steps
      const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x1 - x0, y1 - y0);
      x1 = x0 + Math.cos(a) * len; y1 = y0 + Math.sin(a) * len;
    }
    if (kind === "line") return pack([[x0, y0], [x1, y1]]);
    const back = Math.atan2(y0 - y1, x0 - x1);
    const len = Math.min(Math.hypot(x1 - x0, y1 - y0) * 0.25, 40);
    const head = (d: number): P => [x1 + Math.cos(back + d) * len, y1 + Math.sin(back + d) * len];
    return pack([[x0, y0], [x1, y1], head(0.45), [x1, y1], head(-0.45)]);
  }
  let w = x1 - x0;
  let h = y1 - y0;
  if (even) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  const l = Math.min(x0, x0 + w), t = Math.min(y0, y0 + h), W = Math.abs(w), H = Math.abs(h);
  const r = l + W, b = t + H, cx = l + W / 2, cy = t + H / 2;
  switch (kind) {
    case "rect": return pack([[l, t], [r, t], [r, b], [l, b], [l, t]]);
    case "triangle": return pack([[cx, t], [r, b], [l, b], [cx, t]]);
    case "diamond": return pack([[cx, t], [r, cy], [cx, b], [l, cy], [cx, t]]);
    case "ellipse": return pack(Array.from({ length: 65 }, (_, i): P => {
      const a = (i / 64) * Math.PI * 2;
      return [cx + Math.cos(a) * W / 2, cy + Math.sin(a) * H / 2];
    }));
    case "star": return pack(Array.from({ length: 11 }, (_, i): P => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 === 0 ? 1 : 0.42;
      return [cx + Math.cos(a) * (W / 2) * k, cy + Math.sin(a) * (H / 2) * k];
    }));
    case "roundrect": {
      const rad = Math.min(W, H) * 0.18;
      const arc = (ax: number, ay: number, from: number): P[] => Array.from({ length: 6 }, (_, i): P => {
        const a = from + (i / 5) * (Math.PI / 2);
        return [ax + Math.cos(a) * rad, ay + Math.sin(a) * rad];
      });
      const pts = [...arc(r - rad, t + rad, -Math.PI / 2), ...arc(r - rad, b - rad, 0), ...arc(l + rad, b - rad, Math.PI / 2), ...arc(l + rad, t + rad, Math.PI)];
      return pack([...pts, pts[0]]);
    }
  }
}
