import { act, fireEvent, render, screen } from "@testing-library/react";
import { blotGrid, blotVoxelSvg } from "../../src/ui/blotSprite";
import { blotReact } from "../../src/ui/blotBus";
import { getBlotEnabled, setBlotEnabled } from "../../src/ui/blotPrefs";
import { Blot } from "../../src/ui/Blot";

function reducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

beforeEach(() => { localStorage.clear(); setBlotEnabled(true); reducedMotion(false); });
afterEach(() => { vi.useRealTimers(); });

describe("Blot sprite", () => {
  it("is the ink drop from the film: 14 wide, eyes open by default and shut when asked", () => {
    const open = blotGrid({ eyes: "open", arms: "down" }), shut = blotGrid({ eyes: "shut", arms: "down" });
    expect(Math.max(...open.map((p) => p.c))).toBe(13);
    expect(open.filter((p) => p.kind === "white").length).toBeGreaterThan(0);
    expect(shut.filter((p) => p.kind === "white").length).toBe(0);
  });

  it("draws each pixel as a lit voxel: front, top and side faces", () => {
    const svg = blotVoxelSvg({ eyes: "open", arms: "down" });
    const pixels = blotGrid({ eyes: "open", arms: "down" }).length;
    expect((svg.match(/<rect /g) ?? []).length).toBe(pixels);              // front faces
    expect((svg.match(/<polygon /g) ?? []).length).toBe(pixels * 2);       // top + side faces
    expect(svg).toContain("#2F8CFF");
  });
});

describe("Blot companion", () => {
  it("shows by default and remembers when it is switched off", () => {
    const { rerender } = render(<Blot />);
    expect(screen.getByTestId("blot")).toBeTruthy();
    act(() => setBlotEnabled(false));
    rerender(<Blot />);
    expect(screen.queryByTestId("blot")).toBeNull();
    expect(getBlotEnabled()).toBe(false);
    expect(localStorage.getItem("opennote.blot")).toBe("off");
  });

  it("reacts to real moments, then goes back to idle", () => {
    vi.useFakeTimers();
    render(<Blot />);
    const el = screen.getByTestId("blot");
    act(() => blotReact("hop"));
    expect(el.dataset.mood).toBe("hop");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(el.dataset.mood).toBe("idle");
    act(() => blotReact("cheer"));
    expect(el.dataset.mood).toBe("cheer");
    act(() => blotReact("peek"));
    expect(el.dataset.mood).toBe("peek");
  });

  it("waves when clicked, and the drawing changes with it", () => {
    render(<Blot />);
    const btn = screen.getByRole("button", { name: /blot/i });
    const before = btn.querySelector("svg")!.innerHTML;
    // a real tap: pointer down and up without moving, then click
    fireEvent.pointerDown(btn, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(btn, { clientX: 500, pointerId: 1 });
    fireEvent.click(btn);
    expect(screen.getByTestId("blot").dataset.mood).toBe("wave");
    const after = btn.querySelector("svg")!.innerHTML;
    expect(after).not.toBe(before);
    expect(after).not.toContain("#FFFFFF");     // happy eyes: no whites
  });

  it("holds still when the system asks for reduced motion", () => {
    reducedMotion(true);
    render(<Blot />);
    expect(screen.getByTestId("blot").dataset.still).toBe("true");
  });

  it("can be dragged along the bottom edge and stays there", () => {
    render(<Blot />);
    const el = screen.getByRole("button", { name: /blot/i });
    fireEvent.pointerDown(el, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 300, pointerId: 1 });
    const x = Number(localStorage.getItem("opennote.blot.x"));
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
  });
});
