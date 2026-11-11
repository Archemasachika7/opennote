import { ALL_TEMPLATES, drawPaperTemplate, drawPlanningTemplate, type StemTemplate } from "../../src/store/templates";
import { PAGE_SIZE } from "../../src/store/schema";

const NEW: StemTemplate[] = ["college", "todo", "meeting", "weekly", "monthly", "habit", "coordinate", "storyboard"];
const INK = { minor: "#111", major: "#222", accentLine: "#333", label: "#444" };

function ctx() {
  const c = document.createElement("canvas");
  c.width = PAGE_SIZE.w; c.height = PAGE_SIZE.h;
  return c.getContext("2d")!;
}

describe("planning and study templates", () => {
  it("are offered in the template picker, grouped", () => {
    for (const id of NEW) expect(ALL_TEMPLATES.some((t) => t.id === id)).toBe(true);
    expect(ALL_TEMPLATES.filter((t) => t.group === "planning").map((t) => t.id))
      .toEqual(["todo", "meeting", "weekly", "monthly", "habit", "storyboard"]);
    expect(new Set(ALL_TEMPLATES.map((t) => t.id)).size).toBe(ALL_TEMPLATES.length);
  });

  it.each(NEW)("%s draws lines inside the page", (tpl) => {
    const g = ctx();
    const lines: [number, number][] = [];
    const moveTo = g.moveTo.bind(g), lineTo = g.lineTo.bind(g);
    g.moveTo = (x: number, y: number) => { lines.push([x, y]); moveTo(x, y); };
    g.lineTo = (x: number, y: number) => { lines.push([x, y]); lineTo(x, y); };
    const rects: number[][] = [];
    const strokeRect = g.strokeRect.bind(g);
    g.strokeRect = (x: number, y: number, w: number, h: number) => { rects.push([x, y, w, h]); strokeRect(x, y, w, h); };
    expect(drawPlanningTemplate(g, tpl, PAGE_SIZE.w, PAGE_SIZE.h, INK)).toBe(true);
    expect(lines.length + rects.length).toBeGreaterThan(4);
    for (const [x, y] of lines) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(PAGE_SIZE.w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(PAGE_SIZE.h); }
    for (const [x, y, w, h] of rects) { expect(x + w).toBeLessThanOrEqual(PAGE_SIZE.w + 0.5); expect(y + h).toBeLessThanOrEqual(PAGE_SIZE.h + 0.5); }
  });

  it("leaves the older templates to their own drawing", () => {
    expect(drawPlanningTemplate(ctx(), "cornell", PAGE_SIZE.w, PAGE_SIZE.h, INK)).toBe(false);
    expect(() => drawPaperTemplate(ctx(), "monthly", PAGE_SIZE.w, PAGE_SIZE.h, "light")).not.toThrow();
  });
});
