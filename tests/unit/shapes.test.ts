import { shapePoints, SHAPES } from "../../src/ink/shapes";
import { bbox } from "../../src/ink/geometry";

const box = (p: Float32Array) => { const b = bbox(p); return [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]; };
const count = (p: Float32Array) => p.length / 4;

describe("shapePoints", () => {
  it("lists the predefined shapes", () => {
    expect(SHAPES.map((s) => s.kind)).toEqual(["line", "arrow", "rect", "roundrect", "ellipse", "triangle", "diamond", "star"]);
  });
  it("rectangle spans the drag box and closes", () => {
    const p = shapePoints("rect", 100, 100, 300, 200, false);
    expect(box(p)).toEqual([100, 100, 200, 100]);
    expect(count(p)).toBe(5);
    expect([p[0], p[1]]).toEqual([p[16], p[17]]);
  });
  it("works when dragging up-left", () => {
    expect(box(shapePoints("rect", 300, 200, 100, 100, false))).toEqual([100, 100, 200, 100]);
  });
  it("shift keeps squares and circles even", () => {
    expect(box(shapePoints("rect", 100, 100, 300, 160, true))).toEqual([100, 100, 200, 200]);
    const e = box(shapePoints("ellipse", 0, 0, 120, 40, true));
    expect(e[2]).toBe(e[3]);
  });
  it("ellipse is smooth and fits the box", () => {
    const p = shapePoints("ellipse", 0, 0, 200, 100, false);
    expect(count(p)).toBeGreaterThan(40);
    expect(box(p)).toEqual([0, 0, 200, 100]);
  });
  it("line has 2 points, arrow has a head, star has 10 tips plus close", () => {
    expect(count(shapePoints("line", 0, 0, 100, 50, false))).toBe(2);
    expect(count(shapePoints("arrow", 0, 0, 100, 0, false))).toBe(5);
    expect(count(shapePoints("star", 0, 0, 100, 100, false))).toBe(11);
    expect(count(shapePoints("triangle", 0, 0, 100, 100, false))).toBe(4);
    expect(count(shapePoints("diamond", 0, 0, 100, 100, false))).toBe(5);
    expect(count(shapePoints("roundrect", 0, 0, 200, 100, false))).toBeGreaterThan(16);
  });
});
