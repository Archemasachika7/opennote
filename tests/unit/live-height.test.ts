import { nextLiveHeight, LIVE_BAR } from "../../src/live/LivePage";

describe("nextLiveHeight", () => {
  const scale = 0.5;
  it("grows to fit taller content once", () => {
    const st = { lastOverflow: null as number | null };
    const frameCss = 1872 * scale - LIVE_BAR;
    const h = nextLiveHeight(1872, frameCss + 600, scale, st);
    expect(h).toBe(Math.ceil((frameCss + 600 + LIVE_BAR) / scale));
    // after growing, the content fits exactly -> no further change
    expect(nextLiveHeight(h!, h! * scale - LIVE_BAR, scale, st)).toBeNull();
  });
  it("stops when content keeps overflowing by the same amount (viewport-sized content + margin)", () => {
    const st = { lastOverflow: null as number | null };
    let h = 1872;
    const grown = nextLiveHeight(h, h * scale - LIVE_BAR + 16, scale, st);
    expect(grown).not.toBeNull();
    h = grown!;
    expect(nextLiveHeight(h, h * scale - LIVE_BAR + 16, scale, st)).toBeNull();
  });
  it("ignores reports that fit within 2px", () => {
    const st = { lastOverflow: null as number | null };
    expect(nextLiveHeight(1872, 1872 * scale - LIVE_BAR + 1, scale, st)).toBeNull();
  });
  it("clamps to 20,000", () => {
    const st = { lastOverflow: null as number | null };
    expect(nextLiveHeight(1872, 99999, scale, st)).toBe(20000);
  });
});
