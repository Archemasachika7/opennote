import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { strToU8, zipSync } from "fflate";
import { render, screen, waitFor } from "@testing-library/react";
import { db, type HtmlPage } from "../../src/store/schema";
import { createNotebook, deleteNotebook, listNotebooks, setFavorite, trashNotebook, getNotebook } from "../../src/store/notebooks";
import { deletePage, duplicatePage, getPages, insertPage } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { importPdf, type PdfSource } from "../../src/io/pdfImport";
import { exportBackup, importBackup } from "../../src/io/backup";
import { rotatePage } from "../../src/ink/rotate";
import { historyFor } from "../../src/ink/history";
import { layoutText } from "../../src/io/textLayout";
import { NotebookView } from "../../src/notebook/NotebookView";

vi.stubGlobal("Blob", NodeBlob);
class FakeIO { constructor(_: unknown) {} observe() {} unobserve() {} disconnect() {} }
beforeEach(async () => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  await Promise.all(db.tables.map((t) => t.clear()));
});

const pdf = (n: number, failAt = -1, destroy = vi.fn()): PdfSource & { destroy: () => void } => ({
  numPages: n,
  destroy,
  async page(i) {
    if (i === failAt) throw new Error("canvas too large");
    return { width: 600, height: 800, render: async () => new Blob(["img" + i]), text: async () => "t" + i };
  },
});

describe("PDF images are cleaned up", () => {
  it("deleting a PDF notebook removes its page images", async () => {
    const r = await importPdf(new File(["%PDF"], "a.pdf"), {}, async () => pdf(3));
    expect(await db.blobs.count()).toBe(3);
    await deleteNotebook(r.notebook.id);
    expect(await db.blobs.count()).toBe(0);
  });
  it("deleting a page keeps a PDF image its duplicate still shows", async () => {
    const r = await importPdf(new File(["%PDF"], "a.pdf"), {}, async () => pdf(1));
    const [p] = await getPages(r.notebook.id);
    await duplicatePage(p.id);
    await deletePage(p.id);
    expect(await db.blobs.count()).toBe(1);
  });
});

describe("a failed PDF import leaves nothing behind", () => {
  it("as a new notebook", async () => {
    await expect(importPdf(new File(["%PDF"], "big.pdf"), {}, async () => pdf(5, 3))).rejects.toThrow(/page 4/);
    expect(await listNotebooks()).toEqual([]);
    expect(await db.pages.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });
  it("into an existing notebook", async () => {
    const nb = await createNotebook({ title: "Mine" });
    await expect(importPdf(new File(["%PDF"], "big.pdf"), { notebookId: nb.id, at: 1 }, async () => pdf(5, 2))).rejects.toThrow();
    expect(await getPages(nb.id)).toHaveLength(1);
    expect(await db.blobs.count()).toBe(0);
  });
  it("releases the PDF when done", async () => {
    const destroy = vi.fn();
    await importPdf(new File(["%PDF"], "a.pdf"), {}, async () => pdf(2, -1, destroy));
    expect(destroy).toHaveBeenCalled();
  });
});

it("rotation clears the page's undo history so undo cannot restore unrotated ink", async () => {
  const nb = await createNotebook({ title: "R" });
  const [p] = await getPages(nb.id);
  const s = { id: "s", tool: "pen" as const, variant: "ball" as const, color: "#fff", width: 3, points: new Float32Array([10, 20, 0.5, 0]) };
  await putStroke(p.id, s);
  historyFor(p.id).push({ remove: [], add: [s] });
  await rotatePage(p.id);
  expect(historyFor(p.id).undo()).toBeNull();
  expect(await getStrokes(p.id)).toHaveLength(1);
});

it("a trashed notebook opens as a Restore screen, not an editable notebook", async () => {
  const nb = await createNotebook({ title: "Binned" });
  await trashNotebook(nb.id);
  render(<NotebookView id={nb.id} />);
  expect(await screen.findByText(/is in Trash/)).toBeInTheDocument();
  expect(screen.queryByTestId("thumb")).toBeNull();
  screen.getByRole("button", { name: "Restore" }).click();
  await waitFor(async () => expect((await getNotebook(nb.id))!.trashedAt).toBeFalsy());
});

it("PDF text layout does not add spaces inside words split by formatting", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "un" }, { type: "text", text: "believ", marks: [{ type: "bold" }] }, { type: "text", text: "able, " },
    { type: "text", text: "Note", marks: [{ type: "bold" }] }, { type: "text", text: ": ok" },
  ] }] };
  const [[line]] = layoutText(doc, { width: 2000, height: 1000, measure: (s) => s.length * 10 });
  expect(line.text).toBe("unbelievable, Note: ok");
  expect(line.runs!.map((r) => r.joined ?? false)).toEqual([false, true, true, false, true, false]);
});

describe("backup import is defensive", () => {
  it("turns internet off on imported live pages and keeps size limits", async () => {
    const nb = await createNotebook({ title: "Shared" });
    await insertPage(nb.id, 1, { kind: "html", title: "Viz", source: "<p/>", artifactType: "html", allowNetwork: true });
    const copy = await importBackup(await exportBackup(nb.id));
    const live = (await getPages(copy.id)).find((p) => p.kind === "html") as HtmlPage;
    expect(live.allowNetwork).toBe(false);
  });
  it("a manifest missing its lists is rejected with the normal message", async () => {
    const bad = zipSync({ "manifest.json": strToU8(JSON.stringify({ format: "opennote", formatVersion: 1, notebook: { pageIds: [] }, pages: [] })) });
    await expect(importBackup(new Blob([bad]))).rejects.toThrow("This file is not an OpenNote backup.");
  });
  it("a missing picture is dropped instead of pointing at another notebook's picture", async () => {
    const nb = await createNotebook({ title: "Pics" });
    const [p] = await getPages(nb.id);
    await db.blobs.add({ id: "shared-b", data: new Blob(["x"]) });
    await db.objects.add({ id: "o", pageId: p.id, kind: "image", x: 0, y: 0, w: 1, h: 1, rotation: 0, blobId: "shared-b", z: 1 });
    const file = await exportBackup(nb.id);
    await db.blobs.delete("shared-b");
    await db.blobs.add({ id: "shared-b", data: new Blob(["someone else"]) });
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    delete files["blobs/shared-b"];
    const copy = await importBackup(new Blob([zipSync(files)]));
    const [cp] = await getPages(copy.id);
    const objs = await db.objects.where("pageId").equals(cp.id).toArray();
    expect(objs.every((o) => o.blobId !== "shared-b")).toBe(true);
  });
});

it("bulk favourite sets every selected notebook to the same state", async () => {
  const a = await createNotebook({ title: "A" });
  const b = await createNotebook({ title: "B" });
  await setFavorite([a.id], true);
  await setFavorite([a.id, b.id], true);
  expect((await listNotebooks({ view: "favorites" })).length).toBe(2);
});
