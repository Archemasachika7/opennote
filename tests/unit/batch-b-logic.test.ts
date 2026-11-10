import { snapAngle, rulerEdges, snapToRuler, type RulerLine } from "../../src/ink/ruler";
import { laserAlpha, LASER_FADE_MS, liveLaserPoints } from "../../src/ink/laser";
import { pageLayers, hiddenLayers, lockedLayers, layerOf, moveLayer, BASE_LAYER } from "../../src/ink/layers";
import { review, newSrs, progressOf, isDue, DAY, MIN } from "../../src/study/srs";
import { clampBoardZoom, zoomAt, contentBounds, minimapFit } from "../../src/board/viewport";
import { STRIDE, type Stroke } from "../../src/ink/model";

describe("ruler", () => {
  it("snaps angles near 0/15/45/90 but leaves others", () => {
    expect(snapAngle(1.5)).toBe(0);
    expect(snapAngle(44)).toBe(45);
    expect(snapAngle(-89)).toBe(-90);
    expect(snapAngle(16.4)).toBe(15);
    expect(snapAngle(22)).toBe(22);
  });

  it("projects a stroke that starts near the edge onto that edge", () => {
    const line: RulerLine = { x0: 0, y0: 100, x1: 1000, y1: 100 };
    const pts = new Float32Array([10, 108, 0.5, 0, 200, 95, 0.5, 5, 400, 112, 0.5, 9]);
    const out = snapToRuler(pts, [line], 20)!;
    expect(out).not.toBeNull();
    for (let i = 0; i < out.length; i += STRIDE) expect(out[i + 1]).toBeCloseTo(100);
    expect(out[0]).toBeCloseTo(10);
    expect(out[8]).toBeCloseTo(400);
    expect(out[2]).toBeCloseTo(0.5); // pressure kept
  });

  it("leaves strokes that start far from the edge alone", () => {
    const line: RulerLine = { x0: 0, y0: 100, x1: 1000, y1: 100 };
    expect(snapToRuler(new Float32Array([10, 300, 0.5, 0, 50, 300, 0.5, 1]), [line], 20)).toBeNull();
  });

  it("gives two parallel edges for a rotated ruler", () => {
    const [a, b] = rulerEdges({ cx: 0, cy: 0, angle: 90, length: 200, thickness: 40 });
    // vertical ruler: edges are x = -20 and x = +20
    expect(Math.abs(a.x0 - a.x1)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(a.x0) - 20)).toBeLessThan(1e-6);
    expect(Math.sign(a.x0)).toBe(-Math.sign(b.x0));
  });
});

describe("laser", () => {
  it("fades points out after the fade time", () => {
    expect(laserAlpha(0, 0)).toBe(1);
    expect(laserAlpha(0, LASER_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(laserAlpha(0, LASER_FADE_MS + 1)).toBe(0);
  });
  it("drops faded points", () => {
    const pts = [{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 900 }, { x: 2, y: 2, t: 1500 }];
    expect(liveLaserPoints(pts, 1600)).toHaveLength(2);
  });
});

describe("layers", () => {
  const page = { layers: [
    { id: BASE_LAYER, name: "Layer 1", visible: true, locked: false },
    { id: "b", name: "Notes", visible: false, locked: false },
    { id: "c", name: "Locked", visible: true, locked: true },
  ] };
  it("older pages get a single default layer", () => {
    expect(pageLayers({})).toEqual([{ id: BASE_LAYER, name: "Layer 1", visible: true, locked: false }]);
  });
  it("reports hidden and locked layers; hidden counts as not editable", () => {
    expect([...hiddenLayers(page)]).toEqual(["b"]);
    expect([...lockedLayers(page)].sort()).toEqual(["b", "c"]);
  });
  it("content without a layer is on the base layer", () => {
    expect(layerOf({})).toBe(BASE_LAYER);
    expect(layerOf({ layerId: "b" })).toBe("b");
  });
  it("moves a layer up and down within bounds", () => {
    expect(moveLayer(page.layers, "b", 1).map((l) => l.id)).toEqual([BASE_LAYER, "c", "b"]);
    expect(moveLayer(page.layers, BASE_LAYER, -1).map((l) => l.id)).toEqual([BASE_LAYER, "b", "c"]);
  });
});

describe("spaced repetition", () => {
  const t0 = 1_000_000_000_000;
  it("a new card rated Good is due tomorrow", () => {
    const s = review(newSrs(t0), "good", t0);
    expect(s.state).toBe("review");
    expect(s.interval).toBe(1);
    expect(s.due).toBe(t0 + DAY);
  });
  it("Again keeps a card in learning and due within minutes", () => {
    const s = review(newSrs(t0), "again", t0);
    expect(s.state).toBe("learning");
    expect(s.due).toBe(t0 + MIN);
  });
  it("Easy on a new card skips ahead and raises ease", () => {
    const s = review(newSrs(t0), "easy", t0);
    expect(s.interval).toBe(4);
    expect(s.ease).toBeGreaterThan(newSrs(t0).ease);
  });
  it("review intervals grow by ease, and Again resets with a lapse", () => {
    let s = review(newSrs(t0), "good", t0);
    s = review(s, "good", t0 + DAY);
    expect(s.interval).toBe(Math.round(1 * 2.5));
    const lapsed = review(s, "again", t0 + 4 * DAY);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe("learning");
    expect(lapsed.ease).toBeLessThan(s.ease);
    expect(lapsed.ease).toBeGreaterThanOrEqual(1.3);
  });
  it("progress buckets: new, learning, mastered (interval >= 21 days)", () => {
    const cards = [newSrs(t0), { ...newSrs(t0), state: "learning" as const }, { ...newSrs(t0), state: "review" as const, interval: 30 }, { ...newSrs(t0), state: "review" as const, interval: 3 }];
    expect(progressOf(cards)).toEqual({ new: 1, learning: 2, mastered: 1 });
  });
  it("due means due time has come", () => {
    expect(isDue(newSrs(t0), t0)).toBe(true);
    expect(isDue(review(newSrs(t0), "good", t0), t0 + 1000)).toBe(false);
  });
});

describe("board viewport", () => {
  it("clamps zoom to 10%..400%", () => {
    expect(clampBoardZoom(0.01)).toBe(0.1);
    expect(clampBoardZoom(9)).toBe(4);
  });
  it("zooming keeps the point under the cursor fixed", () => {
    const v = { x: 100, y: 50, zoom: 1 };
    const n = zoomAt(v, 2, 200, 100);
    // logical point under (200,100) before: (300,150); after must be the same
    expect(n.x + 200 / n.zoom).toBeCloseTo(300);
    expect(n.y + 100 / n.zoom).toBeCloseTo(150);
    expect(n.zoom).toBe(2);
  });
  it("content bounds cover strokes and objects", () => {
    const s: Stroke = { id: "s", tool: "pen", variant: "ball", color: "#fff", width: 2, points: new Float32Array([-50, 10, 0.5, 0, 30, 400, 0.5, 1]) };
    const b = contentBounds([s], [{ x: 500, y: -20, w: 100, h: 50 }])!;
    expect(b.x).toBeLessThanOrEqual(-50);
    expect(b.y).toBeLessThanOrEqual(-20);
    expect(b.x + b.w).toBeGreaterThanOrEqual(600);
    expect(b.y + b.h).toBeGreaterThanOrEqual(400);
    expect(contentBounds([], [])).toBeNull();
  });
  it("minimap fit scales the world box into the minimap", () => {
    const f = minimapFit({ x: 0, y: 0, w: 2000, h: 1000 }, 200, 140);
    expect(f.k).toBeCloseTo(0.1);
    expect(f.ox).toBeCloseTo(0);
    expect(f.oy).toBeCloseTo((140 - 100) / 2);
  });
});
