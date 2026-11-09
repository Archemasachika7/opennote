import { createLiveFrameRegistry } from "../../src/live/registry";

describe("LiveFrameRegistry", () => {
  it("grants up to capacity and evicts the lowest priority", () => {
    const r = createLiveFrameRegistry(2);
    const seen: number[] = [];
    r.subscribe(() => seen.push(r.active().length));
    expect(r.request("A", 1)).toBe(true);
    expect(r.request("B", 2)).toBe(true);
    expect(r.request("C", 3)).toBe(true);
    expect(r.active().sort()).toEqual(["B", "C"]);
    expect(r.request("D", 0)).toBe(false);
    expect(Math.max(...seen)).toBeLessThanOrEqual(2);
  });
  it("re-requesting updates priority; release frees a slot", () => {
    const r = createLiveFrameRegistry(2);
    r.request("A", 1);
    r.request("B", 2);
    expect(r.request("A", 5)).toBe(true);
    expect(r.request("C", 3)).toBe(true);
    expect(r.active().sort()).toEqual(["A", "C"]);
    r.release("A");
    expect(r.active()).toEqual(["C"]);
    expect(r.request("D", 0)).toBe(true);
  });
});
