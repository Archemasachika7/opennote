import "fake-indexeddb/auto";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes } from "../../src/store/strokes";
import { InkLayer } from "../../src/ink/InkLayer";
import { setTool } from "../../src/notebook/tool";
import { fingerCount, getPenOnly, HOVER_GRACE_MS, isPalmContact, isPalmPointer, judgeTouch, notePen, PEN_GRACE_MS, resetGate, setPenOnly, trackTouch, typicalTouchWidth } from "../../src/ink/palmGate";
import { smoothInput, speedFactor } from "../../src/ink/render";

let pageId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "Palm" });
  pageId = (await getPages(nb.id))[0].id;
  resetGate();
  setPenOnly(false);
  setTool({ tool: "pen", penSeen: false });
  vi.restoreAllMocks();
});

describe("palm gate decisions", () => {
  it("a contact bigger than a fingertip is a palm, whatever else is happening", () => {
    expect(isPalmContact({ width: 60, height: 30 })).toBe(true);
    expect(isPalmContact({ width: 12, height: 14 })).toBe(false);
    expect(judgeTouch({ width: 70, height: 70 }, { penSeen: false, now: 0 })).toBe("palm");
  });

  it("while the pen hovers, touches or was just lifted, a lone finger is the resting hand", () => {
    notePen("pointermove", 1000); // hovering
    expect(judgeTouch({ width: 10, height: 10 }, { penSeen: true, now: 1000 + HOVER_GRACE_MS - 50 })).toBe("palm");
    notePen("pointerdown", 2000); // touching, and held for a long time
    expect(judgeTouch({ width: 10, height: 10 }, { penSeen: true, now: 9000 })).toBe("palm");
    notePen("pointerup", 9100);
    expect(judgeTouch({ width: 10, height: 10 }, { penSeen: true, now: 9100 + PEN_GRACE_MS + 10 })).toBe("navigate");
  });

  it("with no pen around, fingers write, unless pen-only mode is on", () => {
    expect(judgeTouch({ width: 10, height: 10 }, { penSeen: false, now: 0 })).toBe("write");
    setPenOnly(true);
    expect(getPenOnly()).toBe(true);
    expect(judgeTouch({ width: 10, height: 10 }, { penSeen: false, now: 0 })).toBe("navigate");
  });
});

describe("palm gate in the ink layer", () => {
  const surface = () => render(<InkLayer pageId={pageId} width={600} height={800} paper="dark" />).getByTestId("ink-surface");

  it("a palm-sized touch leaves no ink", async () => {
    const el = surface();
    fireEvent.pointerDown(el, { pointerId: 3, pointerType: "touch", width: 80, height: 60, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(el, { pointerId: 3, pointerType: "touch", width: 80, height: 60, clientX: 150, clientY: 90, buttons: 1 });
    fireEvent.pointerUp(el, { pointerId: 3, pointerType: "touch", clientX: 150, clientY: 90 });
    await new Promise((r) => setTimeout(r, 30));
    expect(await getStrokes(pageId)).toHaveLength(0);
  });

  it("a stroke whose pointer the browser cancels is thrown away, not saved", async () => {
    const el = surface();
    fireEvent.pointerDown(el, { pointerId: 4, pointerType: "pen", clientX: 50, clientY: 50, buttons: 1, pressure: 0.5 });
    fireEvent.pointerMove(el, { pointerId: 4, pointerType: "pen", clientX: 120, clientY: 60, buttons: 1, pressure: 0.5 });
    fireEvent.pointerCancel(el, { pointerId: 4, pointerType: "pen" });
    await new Promise((r) => setTimeout(r, 30));
    expect(await getStrokes(pageId)).toHaveLength(0);
  });

  it("a finger line that was really a palm is dropped when the pen lands", async () => {
    const el = surface();
    fireEvent.pointerDown(el, { pointerId: 5, pointerType: "touch", width: 10, height: 10, clientX: 300, clientY: 500, buttons: 1 });
    fireEvent.pointerMove(el, { pointerId: 5, pointerType: "touch", width: 10, height: 10, clientX: 320, clientY: 520, buttons: 1 });
    // the pen arrives: the "finger stroke" was the hand resting before the pen touched
    fireEvent.pointerDown(el, { pointerId: 6, pointerType: "pen", clientX: 50, clientY: 50, buttons: 1, pressure: 0.5 });
    fireEvent.pointerMove(el, { pointerId: 6, pointerType: "pen", clientX: 150, clientY: 50, buttons: 1, pressure: 0.5 });
    fireEvent.pointerUp(el, { pointerId: 6, pointerType: "pen", clientX: 150, clientY: 50 });
    fireEvent.pointerUp(el, { pointerId: 5, pointerType: "touch", clientX: 320, clientY: 520 });
    await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
    const [s] = await getStrokes(pageId);
    expect(s.points[0]).toBeLessThan(200); // the pen line, not the palm one
  });
});

describe("speed-aware smoothing", () => {
  it("knows slow from fast from the timestamps, and is neutral without them", () => {
    const slow = [[0, 0, 0.5, 0], [1, 0, 0.5, 20], [2, 0, 0.5, 40]];
    const fast = [[0, 0, 0.5, 0], [20, 0, 0.5, 8], [40, 0, 0.5, 16]];
    expect(speedFactor(slow, 1)).toBe(0);
    expect(speedFactor(fast, 1)).toBe(1);
    expect(speedFactor([[0, 0, 0.5], [1, 0, 0.5], [2, 0, 0.5]], 1)).toBe(0.5);
  });

  it("smooths slow wobble more than fast strokes", () => {
    const wobble = (dt: number) => Array.from({ length: 30 }, (_, i) => [i * 3, i % 2 ? 1 : -1, 0.5, i * dt]);
    const dev = (pts: number[][]) => Math.max(...pts.slice(2, -2).map((p) => Math.abs(p[1])));
    expect(dev(smoothInput(wobble(40)))).toBeLessThan(dev(smoothInput(wobble(2))));
  });

  it("keeps a sharp corner sharp (the tip of a v)", () => {
    const v: number[][] = [];
    for (let i = 0; i <= 10; i++) v.push([i * 4, i * 4, 0.5, i * 30]);
    for (let i = 1; i <= 10; i++) v.push([40 + i * 4, 40 - i * 4, 0.5, 300 + i * 30]);
    const out = smoothInput(v);
    const tip = out.reduce((m, p) => (p[1] > m[1] ? p : m));
    expect(tip[1]).toBeCloseTo(40, 0);
  });
});

describe("passive stylus / finger-only screens (measured on a Redmi Pad)", () => {
  const ev = (type: string, pointerId: number, w: number, x = 100, y = 100) =>
    ({ type, pointerId, pointerType: "touch", width: w, height: w, clientX: x, clientY: y }) as unknown as PointerEvent;
  const write = (id: number, w: number, t0: number) => {
    trackTouch(ev("pointerdown", id, w, 0, 0), t0);
    for (let k = 1; k <= 5; k++) trackTouch(ev("pointermove", id, w, k * 10, 0), t0 + k * 20);
    trackTouch(ev("pointerup", id, w, 50, 0), t0 + 200);
  };

  it("learns this screen's writing contact size, then treats clearly bigger contacts as a palm", () => {
    expect(typicalTouchWidth()).toBeNull();
    [2.6, 2.9, 2.9, 2.3, 3.4].forEach((w, i) => write(10 + i, w, i * 1000));
    expect(typicalTouchWidth()).toBeCloseTo(2.9, 1);
    expect(isPalmContact({ width: 3.4, height: 3.4 })).toBe(false); // the stylus at its widest
    expect(isPalmContact({ width: 4.0, height: 4.0 })).toBe(true); // the smallest palm blob measured
  });

  it("a whole hand (three or more contacts at once) is palm, and it never counts as a pinch", () => {
    trackTouch(ev("pointerdown", 1, 4), 0);
    trackTouch(ev("pointerdown", 2, 4), 5);
    expect(fingerCount()).toBe(2);
    trackTouch(ev("pointerdown", 3, 4), 10);
    expect([1, 2, 3].every((id) => isPalmPointer(id))).toBe(true);
    expect(fingerCount()).toBe(0);
  });

  it("a touch that spreads into a palm while drawing loses its line", async () => {
    [2.9, 2.9, 2.9].forEach((w, i) => write(20 + i, w, i * 1000));
    const el = render(<InkLayer pageId={pageId} width={600} height={800} paper="dark" />).getByTestId("ink-surface");
    fireEvent.pointerDown(el, { pointerId: 7, pointerType: "touch", width: 2.9, height: 2.9, clientX: 50, clientY: 50, buttons: 1 });
    fireEvent.pointerMove(el, { pointerId: 7, pointerType: "touch", width: 2.9, height: 2.9, clientX: 90, clientY: 60, buttons: 1 });
    fireEvent.pointerMove(el, { pointerId: 7, pointerType: "touch", width: 9, height: 9, clientX: 95, clientY: 62, buttons: 1 });
    fireEvent.pointerUp(el, { pointerId: 7, pointerType: "touch", clientX: 95, clientY: 62 });
    await new Promise((r) => setTimeout(r, 30));
    expect(await getStrokes(pageId)).toHaveLength(0);
  });
});
