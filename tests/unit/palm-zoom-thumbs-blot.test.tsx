import { act, fireEvent, render, screen } from "@testing-library/react";
import { outlinePath, smoothInput } from "../../src/ink/render";
import { anchorAt, restoreAnchor, wheelFactor } from "../../src/notebook/usePinchZoom";
import { InsertMenu } from "../../src/notebook/InsertMenu";
import { blotGrid } from "../../src/ui/blotSprite";
import { blotReact } from "../../src/ui/blotBus";
import { setBlotEnabled } from "../../src/ui/blotPrefs";
import { Blot } from "../../src/ui/Blot";

describe("smoother strokes", () => {
  it("keeps the exact touch-down and lift-off points", () => {
    const raw = [[0, 0, 0.3], [5, 1, 0.9], [10, 0, 0.2], [15, 1, 0.8], [20, 0, 0.4]];
    const out = smoothInput(raw);
    expect(out[0].slice(0, 2)).toEqual([0, 0]);
    expect(out[out.length - 1].slice(0, 2)).toEqual([20, 0]);
  });

  it("drops sub-pixel jitter and evens out noisy pressure", () => {
    const raw = [[0, 0, 0.5], [0.1, 0.1, 0.9], [0.2, 0, 0.1], [10, 0, 0.9], [20, 0, 0.1], [30, 0, 0.9], [40, 0, 0.1]];
    const out = smoothInput(raw);
    expect(out.length).toBeLessThan(raw.length);
    const swing = (pts: number[][]) => Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]));
    expect(swing(out)).toBeLessThan(swing(raw));
  });

  it("smooths a zig-zag (no sharp corners from digitizer noise)", () => {
    const raw = Array.from({ length: 20 }, (_, i) => [i * 3, i % 2 ? 1.5 : -1.5, 0.5]);
    const out = smoothInput(raw);
    const maxDev = Math.max(...out.slice(1, -1).map((p) => Math.abs(p[1])));
    expect(maxDev).toBeLessThan(1.5);
  });

  it("closes an outline as one curve with no straight seam", () => {
    const calls: string[] = [];
    const fake = {
      moveTo: () => calls.push("M"), lineTo: () => calls.push("L"),
      quadraticCurveTo: () => calls.push("Q"), closePath: () => calls.push("Z"),
    } as unknown as Path2D;
    outlinePath([[0, 0], [10, 0], [10, 10], [0, 10]], fake);
    expect(calls).toEqual(["M", "Q", "Q", "Q", "Q", "Z"]); // every edge is a curve, including the closing one
  });
});

describe("zooming with fingers and trackpads", () => {
  it("turns trackpad pinches into gentle zoom steps and big mouse-wheel jumps into bounded ones", () => {
    expect(wheelFactor(-2)).toBeGreaterThan(1);
    expect(wheelFactor(2)).toBeLessThan(1);
    expect(wheelFactor(-1000)).toBeCloseTo(wheelFactor(-40));
  });

  it("keeps the pinched point of the page under the fingers after the zoom", () => {
    const scroller = document.createElement("div");
    const page = document.createElement("section");
    page.dataset.pageIndex = "0";
    const paper = document.createElement("div");
    paper.className = "paper";
    page.appendChild(paper);
    scroller.appendChild(page);
    document.body.appendChild(scroller);
    let rect = { left: 100, top: 50, width: 400, height: 600 };
    paper.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
    const a = anchorAt(scroller, 300, 350)!;
    expect(a).toMatchObject({ pageIndex: 0, fx: 0.5, fy: 0.5 });
    // after zooming 2x the page is bigger; that point is now at 500, 650 until we scroll
    rect = { left: 100, top: 50, width: 800, height: 1200 };
    restoreAnchor(scroller, a);
    // the page grew 2x around its top-left: scroll by the drift so the same paper point (center) is back at 300, 350
    expect(scroller.scrollLeft).toBe(100 + 0.5 * 800 - 300);
    expect(scroller.scrollTop).toBe(50 + 0.5 * 1200 - 350);
    document.body.removeChild(scroller);
  });
});

describe("Add a page picker", () => {
  it("shows every page type with a description, including SVG/HTML upload", () => {
    const pick = vi.fn();
    render(<InsertMenu onPick={pick} onClose={() => {}} position={3} />);
    expect(screen.getByRole("dialog", { name: "Add a page at position 3" })).toBeTruthy();
    for (const name of ["Ink page", "Text page", "Live page", "Upload SVG or HTML", "PDF pages"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("menuitem", { name: "Upload SVG or HTML" }));
    expect(pick).toHaveBeenCalledWith("file");
  });
});

describe("Blot, livelier", () => {
  beforeEach(() => {
    localStorage.clear(); setBlotEnabled(true);
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => vi.useRealTimers());

  it("has wings for flying", () => {
    const wings = blotGrid({ eyes: "happy", arms: "wings" });
    expect(wings.some((p) => p.c < 0 || p.c > 13)).toBe(true);
  });

  it("flies across the screen and lands back at idle", () => {
    vi.useFakeTimers();
    render(<Blot />);
    const el = screen.getByTestId("blot");
    act(() => blotReact("fly"));
    expect(el.dataset.mood).toBe("fly");
    act(() => { vi.advanceTimersByTime(2500); });
    expect(el.dataset.mood).toBe("idle");
  });

  it("double-tap makes it fly", () => {
    render(<Blot />);
    const btn = screen.getByRole("button", { name: /blot/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId("blot").dataset.mood).toBe("fly");
  });

  it("dozes off when nobody is around, and wakes up on input", () => {
    vi.useFakeTimers();
    render(<Blot />);
    act(() => { vi.advanceTimersByTime(80_000); });
    const el = screen.getByTestId("blot");
    expect(el.dataset.mood).toBe("sleep");
    act(() => { fireEvent.keyDown(document, { key: "a" }); });
    expect(el.dataset.mood).toBe("stretch");
  });
});
