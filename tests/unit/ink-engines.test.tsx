import "fake-indexeddb/auto";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Stroke } from "../../src/ink/model";
import { chunkLine, groupLines } from "../../src/ink/rasterize";
import { cleanPiece, joinPieces, normalizeLatex } from "../../src/ai/inkOcr";
import { calligraphyPath, strokeOptions } from "../../src/ink/render";
import { applyPreset, getPresets, PenPresets, removePreset, saveCurrentPen } from "../../src/notebook/PenPresets";
import { getTool, setTool } from "../../src/notebook/tool";
import { docOf } from "../../src/notebook/RecognizeSheet";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { searchAll } from "../../src/store/search";

let n = 0;
/** A vertical-ish stroke occupying a box (enough for grouping). */
const s = (x: number, y: number, w: number, h: number, extra: Partial<Stroke> = {}): Stroke => ({
  id: `s${n++}`, tool: "pen", variant: "ball", color: "#000", width: 2,
  points: new Float32Array([x, y, 0.5, 0, x + w, y + h, 0.5, 10]), ...extra,
});

describe("reading ink: lines and pieces", () => {
  it("groups strokes into lines top to bottom, and an i-dot joins its line", () => {
    const line1 = [s(0, 100, 10, 30), s(20, 102, 10, 28), s(40, 100, 10, 30)];
    const dot = s(22, 90, 2, 2);
    const line2 = [s(0, 200, 10, 30), s(20, 201, 10, 30)];
    const lines = groupLines([...line2, dot, ...line1]);
    expect(lines).toHaveLength(2);
    expect(lines[0].strokes).toHaveLength(4); // the dot went with line 1
    expect(lines[1].strokes).toHaveLength(2);
  });

  it("ignores shapes and highlighter when reading", () => {
    const lines = groupLines([s(0, 0, 10, 30), s(0, 0, 200, 200, { shape: { kind: "rect" } as Stroke["shape"] }), s(0, 0, 300, 30, { tool: "highlighter" })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].strokes).toHaveLength(1);
  });

  it("splits a long line into pieces at word gaps, never inside a word", () => {
    // 12 words of 3 letters, height 30, word gaps 30 px: one line ~ 13 line-heights wide
    const strokes: Stroke[] = [];
    for (let w = 0; w < 12; w++) for (let l = 0; l < 3; l++) strokes.push(s(w * 60 + l * 9, 100, 8, 30));
    const [line] = groupLines(strokes);
    const pieces = chunkLine(line);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.flatMap((p) => p.strokes)).toHaveLength(36);
    for (const p of pieces) expect(p.strokes.length % 3).toBe(0); // whole words only
  });
});

describe("tidying the models' output", () => {
  it("drops the full stop TrOCR invents and joins pieces into lines", () => {
    expect(cleanPiece("meeting notes.")).toBe("meeting notes");
    expect(cleanPiece("Really?")).toBe("Really?");
    expect(joinPieces(["meeting notes.", "for physics.", "homework due"], [0, 0, 1])).toBe("meeting notes for physics\nhomework due");
  });

  it("turns spaced pix2text tokens into clean LaTeX and unbolds handwriting", () => {
    expect(normalizeLatex("x ^ { 2 } + y ^ { 2 } = r ^ { 2 }")).toBe("x^{2} + y^{2} = r^{2}");
    expect(normalizeLatex("\\mathbf { E } = \\mathbf { m } c ^ { 2 }")).toBe("E = mc^{2}");
    expect(normalizeLatex("\\frac { a } { b }")).toBe("\\frac{a}{b}");
  });

  it("builds a text page document with one paragraph per line", () => {
    expect(docOf("a\n\nb")).toEqual({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ] });
  });
});

describe("new pens", () => {
  it("draws a calligraphy stroke as a chisel nib (one quad per segment)", () => {
    const calls: string[] = [];
    const orig = globalThis.Path2D;
    globalThis.Path2D = class { moveTo() { calls.push("M"); } lineTo() { calls.push("L"); } closePath() { calls.push("Z"); } } as unknown as typeof Path2D;
    try {
      calligraphyPath([[0, 0, 0.5], [10, 0, 0.5], [20, 5, 0.5]], 3);
    } finally { globalThis.Path2D = orig; }
    expect(calls.filter((c) => c === "M")).toHaveLength(2);
    expect(calls.filter((c) => c === "Z")).toHaveLength(2);
  });

  it("gives the marker an even width and the pencil a finer line", () => {
    const marker = strokeOptions({ tool: "pen", variant: "marker", width: 3 }, true);
    const pencil = strokeOptions({ tool: "pen", variant: "pencil", width: 3 }, true);
    const ball = strokeOptions({ tool: "pen", variant: "ball", width: 3 }, true);
    expect(marker.thinning).toBe(0);
    expect(marker.size).toBeGreaterThan(ball.size!);
    expect(pencil.size).toBeLessThan(ball.size!);
  });
});

describe("saved pens", () => {
  beforeEach(() => { for (const p of getPresets()) removePreset(p.id); setTool({ tool: "pen", variant: "ball", width: 3, paletteIndex: 0, color: "#E8E9EE" }); });

  it("saves the pen in hand once, and brings it back with one tap", () => {
    setTool({ variant: "calligraphy", width: 5, paletteIndex: 3 });
    expect(saveCurrentPen()).not.toBeNull();
    expect(saveCurrentPen()).toBeNull(); // no duplicates
    setTool({ variant: "ball", width: 2, paletteIndex: 0 });
    applyPreset(getPresets()[0]);
    expect(getTool()).toMatchObject({ variant: "calligraphy", width: 5, paletteIndex: 3 });
  });

  it("shows chips for saved pens and a button to save the current one", () => {
    render(<PenPresets paper="dark" />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save this pen" })); });
    expect(screen.getByRole("button", { name: /Use saved pen: Ballpoint, size 3/ })).toBeTruthy();
  });
});

describe("searching handwriting", () => {
  it("finds words that were read from handwriting", async () => {
    await db.pages.clear(); await db.notebooks.clear();
    const nb = await createNotebook({ title: "Physics" });
    const [page] = await getPages(nb.id);
    await db.pages.update(page.id, { inkText: "Newton's second law\nF equals m a" } as never);
    const hits = await searchAll("second law");
    expect(hits).toEqual([expect.objectContaining({ notebookId: nb.id, pageId: page.id, kind: "ink" })]);
    expect(hits[0].snippet).toContain("second law");
  });
});
