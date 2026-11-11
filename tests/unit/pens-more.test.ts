import { hueOf, obliqueInput, rainbowColor, strokeOptions } from "../../src/ink/render";

describe("ink brush, oblique nib and rainbow pens", () => {
  it("the ink brush has long tapered ends and thins with speed when there is no pen pressure", () => {
    const o = strokeOptions({ tool: "pen", variant: "inkbrush", width: 3 }, false);
    expect(o.thinning).toBeGreaterThan(0.9);
    expect(o.simulatePressure).toBe(true);
    expect((o.end as { taper: number }).taper).toBeGreaterThan((o.start as { taper: number }).taper);
  });

  it("the oblique nib is thick going down and a hairline going up", () => {
    const down = obliqueInput([[0, 0, 0.5, 0], [0, 10, 0.5, 10], [0, 20, 0.5, 20], [0, 30, 0.5, 30]]);
    const up = obliqueInput([[0, 30, 0.5, 0], [0, 20, 0.5, 10], [0, 10, 0.5, 20], [0, 0, 0.5, 30]]);
    const mid = (pts: number[][]) => pts[Math.floor(pts.length / 2)][2];
    expect(mid(down)).toBeGreaterThan(0.9);
    expect(mid(up)).toBeLessThan(0.2);
  });

  it("the rainbow starts at the picked colour's hue and turns along the stroke", () => {
    expect(hueOf("#FF0000")).toBe(0);
    expect(hueOf("#00FF00")).toBe(120);
    expect(hueOf("#0000FF")).toBe(240);
    expect(rainbowColor(0, "dark", 120)).toBe("hsl(120 85% 62%)");
    expect(rainbowColor(300, "light", 120)).toBe("hsl(60 85% 44%)");
  });
});
