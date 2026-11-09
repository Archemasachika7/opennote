import "fake-indexeddb/auto";
import { db, PAGE_SIZE, type InkPage } from "../../src/store/schema";
import { createNotebook, listNotebooks } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { importPdf, type PdfSource } from "../../src/io/pdfImport";
import { searchAll } from "../../src/store/search";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

const fakePdf = (sizes: [number, number][], texts: string[]): PdfSource => ({
  numPages: sizes.length,
  async page(i) {
    const [width, height] = sizes[i];
    return { width, height, render: async () => new Blob(["img" + i], { type: "image/jpeg" }), text: async () => texts[i] };
  },
});

it("imports a PDF as a new notebook: one ink page per PDF page, PDF as background, sized to the page", async () => {
  const file = new File(["%PDF"], "Lecture 3.pdf", { type: "application/pdf" });
  const r = await importPdf(file, {}, async () => fakePdf([[612, 792], [792, 612]], ["Newton laws", "Momentum"]));
  expect(r.notebook.title).toBe("Lecture 3");
  const pages = (await getPages(r.notebook.id)) as InkPage[];
  expect(pages).toHaveLength(2);
  expect(pages.every((p) => p.kind === "ink" && p.template === "blank" && !!p.background?.blobId)).toBe(true);
  expect(pages[0].size).toEqual({ w: PAGE_SIZE.w, h: Math.round(PAGE_SIZE.w * 792 / 612) });
  expect(pages[1].size).toEqual({ w: PAGE_SIZE.w, h: Math.round(PAGE_SIZE.w * 612 / 792) });
  expect(await db.blobs.get(pages[0].background!.blobId)).toBeTruthy();
  expect(pages[1].background?.pdfText).toBe("Momentum");
});

it("PDF text is searchable", async () => {
  await importPdf(new File(["%PDF"], "L.pdf"), {}, async () => fakePdf([[600, 800]], ["Conservation of momentum"]));
  const hits = await searchAll("momentum");
  expect(hits.some((h) => /Conservation of momentum/.test(h.snippet))).toBe(true);
});

it("inserts PDF pages into an existing notebook at a position", async () => {
  const nb = await createNotebook({ title: "Notes" });
  await importPdf(new File(["%PDF"], "x.pdf"), { notebookId: nb.id, at: 1 }, async () => fakePdf([[600, 800], [600, 800]], ["a", "b"]));
  const pages = (await getPages(nb.id)) as InkPage[];
  expect(pages).toHaveLength(3);
  expect(pages[0].background).toBeUndefined();
  expect(pages.slice(1).every((p) => !!p.background)).toBe(true);
  expect((await listNotebooks()).length).toBe(1);
});

it("a file that is not a PDF gives a readable error and creates nothing", async () => {
  await expect(importPdf(new File(["nope"], "x.pdf"), {}, async () => { throw new Error("Invalid PDF structure"); }))
    .rejects.toThrow("This file could not be opened as a PDF.");
  expect(await listNotebooks()).toEqual([]);
});
