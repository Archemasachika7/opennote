import { encodeStroke, decodeStroke, type Stroke } from "../../src/ink/model";
import { bbox, hitTest, splitByEraser, lassoContains, snapShape, translate, scale } from "../../src/ink/geometry";

function mk(pts: [number, number][], width = 4): Stroke {
  const a = new Float32Array(pts.length * 4);
  pts.forEach(([x, y], i) => a.set([x, y, 0.5, i * 8], i * 4));
  return { id: "s", tool: "pen", variant: "ball", color: "#fff", width, points: a };
}
const line = (n: number, y = 100) => mk(Array.from({ length: n }, (_, i) => [i * 2, y] as [number, number]));
const noise = (i: number) => Math.sin(i * 12.9898) * 1.5;

describe("model", () => {
  it("encode/decode round-trips exactly", () => {
    const s = { ...line(20), paletteIndex: 3, variant: "fountain" as const };
    const d = decodeStroke(encodeStroke(s));
    expect({ ...d, points: Array.from(d.points) }).toEqual({ ...s, points: Array.from(s.points) });
  });
});

describe("geometry", () => {
  it("bbox, translate, scale", () => {
    const s = mk([[10, 20], [30, 60]]);
    expect(bbox(s.points)).toEqual({ x: 10, y: 20, w: 20, h: 40 });
    expect(bbox(translate(s, 5, -5).points)).toEqual({ x: 15, y: 15, w: 20, h: 40 });
    expect(bbox(scale(s, 2, 2, 10, 20).points)).toEqual({ x: 10, y: 20, w: 40, h: 80 });
  });

  it("hitTest near vs far", () => {
    const s = line(50);
    expect(hitTest(s, 40, 101, 1)).toBe(true);
    expect(hitTest(s, 40, 150, 1)).toBe(false);
  });

  it("splitByEraser across the middle yields two fragments", () => {
    const s = line(100);
    const parts = splitByEraser(s, [100, 80, 100, 120], 6);
    expect(parts).toHaveLength(2);
    const total = parts.reduce((n, p) => n + p.points.length / 4, 0);
    expect(total).toBeLessThan(100);
    expect(new Set(parts.map((p) => p.id)).size).toBe(2);
    expect(parts.every((p) => p.id !== s.id)).toBe(true);
  });

  it("splitByEraser that misses returns the stroke unchanged", () => {
    const s = line(10);
    expect(splitByEraser(s, [500, 500, 600, 600], 6)).toEqual([s]);
  });

  it("lassoContains", () => {
    const s = mk([[10, 10], [20, 20], [30, 30]]);
    expect(lassoContains([0, 0, 40, 0, 40, 40, 0, 40], s)).toBe(true);
    expect(lassoContains([0, 0, 18, 0, 18, 40, 0, 40], s)).toBe(false);
  });

  it("snapShape recognises a noisy line", () => {
    const pts = Array.from({ length: 60 }, (_, i) => [i * 5, 200 + noise(i)] as [number, number]);
    const r = snapShape(mk(pts).points);
    expect(r?.kind).toBe("line");
    expect(r!.points.length / 4).toBe(2);
  });

  it("snapShape recognises a rectangle", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) pts.push([100 + i * 5, 100 + noise(i)]);
    for (let i = 0; i <= 30; i++) pts.push([300 + noise(i), 100 + i * 5]);
    for (let i = 0; i <= 40; i++) pts.push([300 - i * 5, 250 + noise(i)]);
    for (let i = 0; i <= 30; i++) pts.push([100 + noise(i), 250 - i * 5]);
    expect(snapShape(mk(pts).points)?.kind).toBe("rect");
  });

  it("snapShape recognises an ellipse", () => {
    const pts = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI * 2;
      return [300 + Math.cos(a) * (100 + noise(i)), 300 + Math.sin(a) * (100 + noise(i))] as [number, number];
    });
    expect(snapShape(mk(pts).points)?.kind).toBe("ellipse");
  });

  it("snapShape ignores a scribble", () => {
    const pts = Array.from({ length: 80 }, (_, i) => [100 + (i % 7) * 30 + i, 100 + ((i * 37) % 90)] as [number, number]);
    expect(snapShape(mk(pts).points)).toBeNull();
  });

  it("snapShape recognises an arrow", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 50; i++) pts.push([100 + i * 6, 300]);
    for (let i = 1; i <= 8; i++) pts.push([400 - i * 5, 300 - i * 5]);
    expect(snapShape(mk(pts).points)?.kind).toBe("arrow");
  });
});
