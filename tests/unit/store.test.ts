import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import { createNotebook, deleteNotebook, listNotebooks, renameNotebook, toggleBookmark, getNotebook } from "../../src/store/notebooks";
import { insertPage, movePage, deletePage, getPages, duplicatePage, updatePage } from "../../src/store/pages";
import { putStroke, getStrokes, replaceStrokes } from "../../src/store/strokes";
import { createFolder, deleteFolder } from "../../src/store/folders";
import type { Stroke } from "../../src/ink/model";

const stroke = (id: string): Stroke => ({
  id, tool: "pen", variant: "ball", color: "#fff", width: 3,
  points: new Float32Array([0, 0, 0.5, 0, 10, 10, 0.5, 16]),
});
const html = { kind: "html" as const, title: "Viz", source: "<p>x</p>", artifactType: "html" as const, allowNetwork: false };

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("store", () => {
  it("createNotebook makes one blank ink page", async () => {
    const nb = await createNotebook({ title: "Physics" });
    const pages = await getPages(nb.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ kind: "ink", template: "blank", notebookId: nb.id });
  });

  it("insertPage places a page between existing pages", async () => {
    const nb = await createNotebook({ title: "A" });
    await insertPage(nb.id, 1, { kind: "ink", template: "ruled" });
    await insertPage(nb.id, 1, html);
    expect((await getPages(nb.id)).map((p) => p.kind)).toEqual(["ink", "html", "ink"]);
  });

  it("movePage reorders by index", async () => {
    const nb = await createNotebook({ title: "A" });
    await insertPage(nb.id, 1, { kind: "ink", template: "grid" });
    const h = await insertPage(nb.id, 2, html);
    await movePage(nb.id, 2, 0);
    const pages = await getPages(nb.id);
    expect(pages[0].id).toBe(h.id);
    expect(pages.map((p) => p.kind)).toEqual(["html", "ink", "ink"]);
  });

  it("deletePage removes the page and its strokes", async () => {
    const nb = await createNotebook({ title: "A" });
    const [p] = await getPages(nb.id);
    await putStroke(p.id, stroke("s1"));
    await deletePage(p.id);
    expect(await getPages(nb.id)).toHaveLength(0);
    expect(await getStrokes(p.id)).toHaveLength(0);
    expect((await getNotebook(nb.id))!.pageIds).not.toContain(p.id);
  });

  it("deleteNotebook cascades", async () => {
    const nb = await createNotebook({ title: "A" });
    const [p] = await getPages(nb.id);
    await putStroke(p.id, stroke("s1"));
    await deleteNotebook(nb.id);
    expect(await db.pages.where("notebookId").equals(nb.id).count()).toBe(0);
    expect(await db.strokes.where("pageId").equals(p.id).count()).toBe(0);
    expect(await db.objects.where("pageId").equals(p.id).count()).toBe(0);
  });

  it("rejects html sources over 5 MB", async () => {
    const nb = await createNotebook({ title: "A" });
    const big = { ...html, source: "x".repeat(5 * 1024 * 1024 + 1) };
    await expect(insertPage(nb.id, 1, big)).rejects.toThrow("Too large (max 5 MB)");
    expect(await getPages(nb.id)).toHaveLength(1);
  });

  it("bumps notebook updatedAt on page mutation", async () => {
    const nb = await createNotebook({ title: "A" });
    await new Promise((r) => setTimeout(r, 5));
    await insertPage(nb.id, 1, { kind: "text" });
    expect((await getNotebook(nb.id))!.updatedAt).toBeGreaterThan(nb.updatedAt);
  });

  it("strokes round-trip and replace atomically", async () => {
    const nb = await createNotebook({ title: "A" });
    const [p] = await getPages(nb.id);
    await putStroke(p.id, stroke("a"));
    await replaceStrokes(p.id, ["a"], [stroke("b"), stroke("c")]);
    const got = await getStrokes(p.id);
    expect(got.map((s) => s.id).sort()).toEqual(["b", "c"]);
    expect(got[0].points.constructor.name).toBe("Float32Array"); // jsdom vs node realm
    expect(Array.from(got[0].points)).toEqual([0, 0, 0.5, 0, 10, 10, 0.5, 16]);
  });

  it("duplicatePage copies the page and its strokes right after it", async () => {
    const nb = await createNotebook({ title: "A" });
    const [p] = await getPages(nb.id);
    await putStroke(p.id, stroke("a"));
    const d = await duplicatePage(p.id);
    const pages = await getPages(nb.id);
    expect(pages.map((x) => x.id)).toEqual([p.id, d.id]);
    expect(await getStrokes(d.id)).toHaveLength(1);
  });

  it("rename, list sort, bookmarks, updatePage", async () => {
    const a = await createNotebook({ title: "Zeta" });
    await createNotebook({ title: "Alpha" });
    await renameNotebook(a.id, "Beta");
    expect((await listNotebooks({ sort: "title" })).map((n) => n.title)).toEqual(["Alpha", "Beta"]);
    const [p] = await getPages(a.id);
    await toggleBookmark(a.id, p.id);
    expect((await getNotebook(a.id))!.bookmarks).toEqual([p.id]);
    await toggleBookmark(a.id, p.id);
    expect((await getNotebook(a.id))!.bookmarks).toEqual([]);
    await updatePage(p.id, { template: "dot" });
    expect((await getPages(a.id))[0]).toMatchObject({ template: "dot" });
  });

  it("folders filter and deleteFolder moves notebooks to parent", async () => {
    const f = await createFolder("Sem 1");
    const nb = await createNotebook({ title: "In folder", folderId: f.id });
    await createNotebook({ title: "Root" });
    expect((await listNotebooks({ folderId: f.id })).map((n) => n.id)).toEqual([nb.id]);
    await deleteFolder(f.id);
    expect((await getNotebook(nb.id))!.folderId).toBeNull();
  });
});

it("deleting a page keeps images still used by its duplicate", async () => {
  const nb = await createNotebook({ title: "A" });
  const [p] = await getPages(nb.id);
  await db.blobs.add({ id: "b1", data: new Blob(["img"]) });
  await db.objects.add({ id: "o1", pageId: p.id, kind: "image", x: 0, y: 0, w: 10, h: 10, rotation: 0, blobId: "b1", z: 1 });
  const d = await duplicatePage(p.id);
  await deletePage(p.id);
  expect(await db.objects.where("pageId").equals(d.id).count()).toBe(1);
  expect(await db.blobs.get("b1")).toBeTruthy();
  await deletePage(d.id);
  expect(await db.blobs.get("b1")).toBeUndefined();
});
