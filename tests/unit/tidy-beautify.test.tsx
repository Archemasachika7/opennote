import { fireEvent, render, screen } from "@testing-library/react";
import { STRIDE, type Stroke } from "../../src/ink/model";
import { measureSlant, smoothPoints, tidyStrokes } from "../../src/ink/tidy";
import { beautifyInput, strokeOptions } from "../../src/ink/render";
import { SelectionOverlay } from "../../src/ink/SelectionOverlay";
import { IDENTITY } from "../../src/ink/selection";

/**
 * A handwritten-looking "word": a zigzag of down and up strokes (like m / n humps) starting at x, sitting on
 * baseline y, `h` tall, `w` wide, leaning by `lean` (x shift per unit of height, negative = leans right).
 */
function word(id: string, x: number, y: number, w: number, h: number, lean = 0, tool: Stroke["tool"] = "pen"): Stroke {
  const pts: number[] = [];
  const humps = Math.max(2, Math.round(w / (h * 0.5)));
  for (let i = 0; i <= humps * 8; i++) {
    const t = i / 8;
    const up = t % 1 < 0.5 ? (t % 1) * 2 : 2 - (t % 1) * 2; // 0 -> 1 -> 0 per hump
    const yy = y - up * h;
    pts.push(x + (t / humps) * w - lean * (yy - y), yy, 0.5, i * 8);
  }
  return { id, tool, variant: "ball", color: "#000", width: 2, points: new Float32Array(pts) };
}

const pts = (s: Stroke) => { const out: [number, number][] = []; for (let i = 0; i < s.points.length; i += STRIDE) out.push([s.points[i], s.points[i + 1]]); return out; };
const xs = (s: Stroke) => pts(s).map((p) => p[0]);
const ys = (s: Stroke) => pts(s).map((p) => p[1]);
const mid = (s: Stroke) => { const y = ys(s).sort((a, b) => a - b); return y[Math.floor(y.length / 2)]; };
const height = (s: Stroke) => Math.max(...ys(s)) - Math.min(...ys(s));

describe("Tidy handwriting", () => {
  it("levels a line that drifts uphill", () => {
    // four words, each 7 px higher than the one before (a line rising to the right)
    const line = [0, 1, 2, 3].map((i) => word(`w${i}`, 20 + i * 90, 300 - i * 7, 60, 20));
    const before = mid(line[3]) - mid(line[0]);
    const out = tidyStrokes(line, 1, { straighten: true, slant: false, size: false, spacing: false, smooth: false });
    const byId = new Map(out.map((s) => [s.id, s]));
    const after = mid(byId.get("w3")!) - mid(byId.get("w0")!);
    expect(Math.abs(before)).toBeGreaterThan(18);
    expect(Math.abs(after)).toBeLessThan(3);
  });

  it("levels a long drifting line as one line, but keeps stacked lines apart", () => {
    // rises 46 px over five words: more than a word is tall, so it first groups as two side-by-side pieces
    const drift = [0, 1, 2, 3, 4].map((i) => word(`d${i}`, 20 + i * 100, 300 - i * 11.5, 70, 20));
    const below = [0, 1, 2].map((i) => word(`p${i}`, 20 + i * 100, 360, 70, 20));
    const out = new Map(tidyStrokes([...drift, ...below], 1, { straighten: true, slant: false, size: false, spacing: false, smooth: false }).map((s) => [s.id, s]));
    expect(Math.abs(mid(out.get("d4")!) - mid(out.get("d0")!))).toBeLessThan(3);
    expect(mid(out.get("p0")!) - mid(out.get("d0")!)).toBeGreaterThan(20); // the line below is still below
  });

  it("stands slanted letters upright", () => {
    const line = [0, 1, 2].map((i) => word(`w${i}`, 20 + i * 90, 300, 60, 24, -0.45));
    const step = 3;
    const before = measureSlant(line.map((s) => s.points), step)!;
    const out = tidyStrokes(line, 1, { straighten: false, slant: true, size: false, spacing: false, smooth: false });
    const after = measureSlant(out.map((s) => s.points), step)!;
    expect(Math.abs(before)).toBeGreaterThan(0.3);
    expect(Math.abs(after)).toBeLessThan(0.08);
  });

  it("evens out word sizes and the gaps between words", () => {
    const line = [word("a", 0, 300, 60, 20), word("b", 90, 300, 60, 34), word("c", 230, 300, 60, 20), word("d", 320, 300, 60, 20)];
    const out = new Map(tidyStrokes(line, 1, { straighten: false, slant: false, size: true, spacing: true, smooth: false }).map((s) => [s.id, s]));
    expect(height(out.get("b")!)).toBeLessThan(height(line[1]) * 0.8); // the big word shrank toward the others
    const order = ["a", "b", "c", "d"].map((id) => out.get(id)!);
    const gaps = order.slice(1).map((w, i) => Math.min(...xs(w)) - Math.max(...xs(order[i])));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(2);
  });

  it("strength 0 changes nothing; shapes and highlighter are left alone; ids are kept for one-step undo", () => {
    const line = [word("a", 0, 300, 60, 20), word("b", 90, 280, 60, 20), word("hl", 0, 300, 200, 20, 0, "highlighter")];
    expect(tidyStrokes(line, 0)).toEqual([]);
    const out = tidyStrokes(line, 0.6);
    expect(out.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(line[0].points[1]).toBe(300); // inputs are not mutated
  });

  it("smoothing keeps the ends and sharp corners where they are", () => {
    // an "L": down then right, with a wobble on the way down
    const p = new Float32Array([0, 0, 0.5, 0, 3, 10, 0.5, 0, -2, 20, 0.5, 0, 0, 30, 0.5, 0, 10, 30, 0.5, 0, 20, 30, 0.5, 0]);
    smoothPoints(p, 1);
    expect([p[0], p[1]]).toEqual([0, 0]);
    expect([p[20], p[21]]).toEqual([20, 30]);
    expect([p[12], p[13]]).toEqual([0, 30]); // the corner
    expect(Math.abs(p[4])).toBeLessThan(3); // the wobble is smaller
  });
});

describe("Beautify pen", () => {
  it("gives a thick-and-thin flow from the stroke direction and tapers the ends", () => {
    const line = (dx: number, dy: number) => Array.from({ length: 12 }, (_, i) => [i * dx, i * dy, 0.5]);
    const widthOf = (p: number[][]) => p[6][2];
    const across = widthOf(beautifyInput(line(4, -4 * Math.tan(Math.PI / 2 - Math.PI / 5)))); // roughly across the nib
    const along = widthOf(beautifyInput(line(4 * Math.cos(-Math.PI / 5), 4 * Math.sin(-Math.PI / 5)))); // along the nib
    expect(across).toBeGreaterThan(along * 2);
    const o = strokeOptions({ tool: "pen", variant: "beautify", width: 2 }, false);
    expect(o.simulatePressure).toBe(false);
    expect(o.start?.taper).toBeGreaterThan(0);
    expect(o.end?.taper).toBeGreaterThan(0);
  });
});

describe("Tidy panel on the lasso", () => {
  const box = { x: 0, y: 0, w: 100, h: 40 };
  const base = { box, scale: 1, xf: IDENTITY, onPreview: () => {}, onCommit: () => {}, onDelete: () => {}, onDuplicate: () => {}, onRecolor: () => {} };

  it("shows a Tidy button, then a strength slider with Apply and Cancel", () => {
    const onTidy = vi.fn();
    const { rerender } = render(<SelectionOverlay {...base} onTidy={onTidy} />);
    fireEvent.click(screen.getByRole("button", { name: "Tidy handwriting" }));
    expect(onTidy).toHaveBeenCalled();
    const onStrength = vi.fn(), onApply = vi.fn(), onCancel = vi.fn();
    rerender(<SelectionOverlay {...base} onTidy={onTidy} tidy={{ strength: 0.7, onStrength, onApply, onCancel }} />);
    const slider = screen.getByRole("slider", { name: "Tidy strength" }) as HTMLInputElement;
    expect(slider.value).toBe("70");
    fireEvent.change(slider, { target: { value: "40" } });
    expect(onStrength).toHaveBeenCalledWith(0.4);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApply).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Delete selection" })).toBeNull(); // the panel replaces the toolbar
  });
});
