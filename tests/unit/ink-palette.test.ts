import { inkPalette, resolveColor } from "../../src/ink/render";
import type { Stroke } from "../../src/ink/model";

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const x = Math.max(lum(a), lum(b));
  const y = Math.min(lum(a), lum(b));
  return (x + 0.05) / (y + 0.05);
}

describe("palette", () => {
  it("8 colours with at least 4.5:1 contrast on each paper", () => {
    const papers: Array<["dark" | "light", string]> = [["dark", "#1E2028"], ["light", "#F3F1EC"]];
    for (const [paper, bg] of papers) {
      const p = inkPalette(paper);
      expect(p).toHaveLength(8);
      for (const c of p) expect(contrast(c, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("palette strokes swap with paper; custom colours do not", () => {
    const s = { color: "#123456", paletteIndex: 2 } as Stroke;
    expect(resolveColor(s, "dark")).toBe(inkPalette("dark")[2]);
    expect(resolveColor(s, "light")).toBe(inkPalette("light")[2]);
    expect(resolveColor({ ...s, paletteIndex: undefined }, "light")).toBe("#123456");
  });
});
