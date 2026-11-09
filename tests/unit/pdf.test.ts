import { PDFDocument } from "pdf-lib";
import { assemblePdf, type PageImage } from "../../src/io/exportPdf";
import { layoutText } from "../../src/io/textLayout";

const PNG_1x1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const img = (w: number, h: number): PageImage => ({ bytes: PNG_1x1, type: "png", w, h });

describe("assemblePdf", () => {
  it("makes one PDF page per page image, A4 width, keeping each page's aspect ratio", async () => {
    const bytes = await assemblePdf([img(1404, 1872), img(1404, 3000), img(1404, 1872)], { title: "Physics" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const [p1, p2] = doc.getPages();
    expect(Math.round(p1.getWidth())).toBe(595);
    expect(p1.getHeight() / p1.getWidth()).toBeCloseTo(1872 / 1404, 2);
    expect(p2.getHeight() / p2.getWidth()).toBeCloseTo(3000 / 1404, 2);
    expect(doc.getTitle()).toBe("Physics");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("layoutText", () => {
  const measure = (s: string) => s.length * 10; // 10px per character
  const doc = (blocks: unknown[]) => ({ type: "doc", content: blocks });
  const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

  it("wraps paragraphs to the width and keeps block styles", () => {
    const pages = layoutText(doc([{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] }, p("aaa bbb ccc ddd")]), { width: 80, height: 1000, measure });
    expect(pages).toHaveLength(1);
    const lines = pages[0];
    expect(lines[0]).toMatchObject({ text: "Title", style: "h1" });
    expect(lines.filter((l) => l.style === "p").map((l) => l.text)).toEqual(["aaa bbb", "ccc ddd"]);
  });

  it("marks list items and checklist state", () => {
    const pages = layoutText(doc([
      { type: "bulletList", content: [{ type: "listItem", content: [p("one")] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("done")] }] },
    ]), { width: 500, height: 1000, measure });
    expect(pages[0].map((l) => l.prefix)).toEqual(["•", "[x]"]);
  });

  it("continues onto more pages when the text is longer than one page", () => {
    const many = Array.from({ length: 80 }, (_, i) => p(`line ${i}`));
    const pages = layoutText(doc(many), { width: 500, height: 600, measure });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((l) => l.text.startsWith("line")).length).toBe(80);
  });
});
