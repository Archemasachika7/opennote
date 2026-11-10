import { db, newId, now, PAGE_SIZE, MAX_HTML_BYTES, unreferencedBlobs, type NewPage, type Page, type PageObject, type PagePatch } from "./schema";
import { layerOf, pageLayers, type Layer } from "../ink/layers";
import { notifyPageChanged } from "../ink/pageEvents";
import { clearHistory } from "../ink/history";
import type { Stroke } from "../ink/model";

export const TOO_LARGE = "Too large (max 5 MB)";

function build(notebookId: string, init: NewPage): Page {
  const t = now();
  const base = { id: newId(), notebookId, createdAt: t, updatedAt: t, size: { ...PAGE_SIZE } };
  switch (init.kind) {
    case "ink": return {
      ...base, kind: "ink", template: init.template, ...(init.size ? { size: { ...init.size } } : {}),
      ...(init.background ? { background: { ...init.background } } : {}),
      ...(init.board ? { board: true } : {}), ...(init.title ? { title: init.title } : {}),
    };
    case "text": return { ...base, kind: "text", doc: null };
    case "html": return { ...base, ...init, kind: "html", height: PAGE_SIZE.h };
  }
}

export async function insertPage(notebookId: string, index: number, init: NewPage): Promise<Page> {
  if (init.kind === "html" && init.source.length > MAX_HTML_BYTES) throw new Error(TOO_LARGE);
  const page = build(notebookId, init);
  await db.transaction("rw", db.notebooks, db.pages, async () => {
    const nb = await db.notebooks.get(notebookId);
    if (!nb) throw new Error("Notebook not found");
    const pageIds = [...nb.pageIds];
    pageIds.splice(Math.max(0, Math.min(index, pageIds.length)), 0, page.id);
    await db.pages.add(page);
    await db.notebooks.update(notebookId, { pageIds, updatedAt: now() });
  });
  return page;
}

export async function getPages(notebookId: string): Promise<Page[]> {
  const nb = await db.notebooks.get(notebookId);
  if (!nb) return [];
  const pages = await db.pages.bulkGet(nb.pageIds);
  return pages.filter((p): p is Page => !!p);
}

export const getPage = (id: string): Promise<Page | undefined> => db.pages.get(id);

export async function movePage(notebookId: string, from: number, to: number): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const nb = await db.notebooks.get(notebookId);
    if (!nb) return;
    const pageIds = [...nb.pageIds];
    const [moved] = pageIds.splice(from, 1);
    if (moved === undefined) return;
    pageIds.splice(Math.max(0, Math.min(to, pageIds.length)), 0, moved);
    await db.notebooks.update(notebookId, { pageIds, updatedAt: now() });
  });
}

export async function updatePage(id: string, patch: PagePatch): Promise<void> {
  if (typeof patch.source === "string" && patch.source.length > MAX_HTML_BYTES) throw new Error(TOO_LARGE);
  await db.transaction("rw", db.pages, db.notebooks, async () => {
    const p = await db.pages.get(id);
    if (!p) return;
    const t = now();
    await db.pages.update(id, { ...patch, updatedAt: t } as Partial<Page>);
    await db.notebooks.update(p.notebookId, { updatedAt: t });
  });
}

/** Add a whiteboard board at the end, named "Board N". */
export async function insertBoard(notebookId: string): Promise<Page> {
  const nb = await db.notebooks.get(notebookId);
  const n = (nb?.pageIds.length ?? 0) + 1;
  return insertPage(notebookId, n, { kind: "ink", template: "dot", board: true, title: `Board ${n}` });
}

export async function setLayers(pageId: string, layers: Layer[]): Promise<void> {
  await updatePage(pageId, { layers });
}

/** Add a new layer on top of the page's layers. */
export async function addLayer(pageId: string): Promise<Layer> {
  const p = await db.pages.get(pageId);
  if (!p || p.kind !== "ink") throw new Error("Layers are only on ink pages");
  const ls = pageLayers(p);
  const names = new Set(ls.map((l) => l.name));
  let n = ls.length + 1;
  while (names.has(`Layer ${n}`)) n++;
  const l: Layer = { id: newId(), name: `Layer ${n}`, visible: true, locked: false };
  await setLayers(pageId, [...ls, l]);
  return l;
}

/** Delete a layer and everything on it. The last remaining layer is never deleted. */
export async function deleteLayer(pageId: string, layerId: string): Promise<void> {
  await db.transaction("rw", [db.pages, db.notebooks, db.strokes, db.objects, db.blobs, db.cards], async () => {
    const p = await db.pages.get(pageId);
    if (!p || p.kind !== "ink") return;
    const ls = pageLayers(p);
    if (ls.length <= 1 || !ls.some((l) => l.id === layerId)) return;
    const strokeIds = (await db.strokes.where("pageId").equals(pageId).toArray()).filter((r) => layerOf(r.stroke) === layerId).map((r) => r.id);
    await db.strokes.bulkDelete(strokeIds);
    const objs = (await db.objects.where("pageId").equals(pageId).toArray()).filter((o) => layerOf(o) === layerId);
    await db.objects.bulkDelete(objs.map((o) => o.id));
    await db.blobs.bulkDelete(await unreferencedBlobs(objs.map((o) => o.blobId).filter((x): x is string => !!x)));
    await updatePage(pageId, { layers: ls.filter((l) => l.id !== layerId) });
  });
  // open ink layers hold strokes in memory: reload them; undo could bring back strokes on a dead layer
  clearHistory(pageId);
  notifyPageChanged(pageId);
}

export async function duplicatePage(pageId: string): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects], async () => {
    const p = await db.pages.get(pageId);
    if (!p) throw new Error("Page not found");
    const t = now();
    const copy = { ...p, id: newId(), createdAt: t, updatedAt: t } as Page;
    await db.pages.add(copy);
    const strokes = await db.strokes.where("pageId").equals(pageId).toArray();
    await db.strokes.bulkAdd(strokes.map((r) => {
      const id = newId();
      return { id, pageId: copy.id, stroke: { ...r.stroke, id } };
    }));
    const objs = await db.objects.where("pageId").equals(pageId).toArray();
    await db.objects.bulkAdd(objs.map((o) => ({ ...o, id: newId(), pageId: copy.id })));
    const nb = await db.notebooks.get(p.notebookId);
    if (nb) {
      const pageIds = [...nb.pageIds];
      pageIds.splice(pageIds.indexOf(pageId) + 1, 0, copy.id);
      await db.notebooks.update(nb.id, { pageIds, updatedAt: t });
    }
    return copy;
  });
}

export type DeletedPageSnapshot = {
  page: Page;
  index: number;
  bookmarked: boolean;
  strokes: { id: string; pageId: string; stroke: Stroke }[];
  objects: PageObject[];
  blobs: { id: string; data: Blob }[];
};

/** Snapshot a page, delete it immediately, and return a snapshot that `restoreDeletedPage` can restore. */
export async function deletePageWithUndo(pageId: string): Promise<DeletedPageSnapshot | null> {
  const p = await db.pages.get(pageId);
  if (!p) return null;
  const nb = await db.notebooks.get(p.notebookId);
  const index = nb ? Math.max(0, nb.pageIds.indexOf(pageId)) : 0;
  const bookmarked = nb ? nb.bookmarks.includes(pageId) : false;
  const strokes = await db.strokes.where("pageId").equals(pageId).toArray();
  const objects = await db.objects.where("pageId").equals(pageId).toArray();
  const blobIds = new Set<string>();
  for (const o of objects) if (o.blobId) blobIds.add(o.blobId);
  if (p.kind === "ink" && p.background?.blobId) blobIds.add(p.background.blobId);
  if (p.kind === "html" && p.snapshotBlobId) blobIds.add(p.snapshotBlobId);
  const blobs = (await db.blobs.bulkGet([...blobIds])).filter((b): b is { id: string; data: Blob } => !!b);
  await deletePage(pageId);
  return { page: p, index, bookmarked, strokes, objects, blobs };
}

export async function restoreDeletedPage(snap: DeletedPageSnapshot): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs], async () => {
    const nb = await db.notebooks.get(snap.page.notebookId);
    if (!nb) return;
    for (const b of snap.blobs) {
      if (!(await db.blobs.get(b.id))) await db.blobs.put(b);
    }
    await db.pages.put(snap.page);
    if (snap.strokes.length) await db.strokes.bulkPut(snap.strokes);
    if (snap.objects.length) await db.objects.bulkPut(snap.objects);
    const pageIds = nb.pageIds.filter((id) => id !== snap.page.id);
    pageIds.splice(Math.max(0, Math.min(snap.index, pageIds.length)), 0, snap.page.id);
    const bookmarks = snap.bookmarked && !nb.bookmarks.includes(snap.page.id)
      ? [...nb.bookmarks, snap.page.id]
      : nb.bookmarks;
    await db.notebooks.update(nb.id, { pageIds, bookmarks, updatedAt: now() });
  });
}

export async function deletePage(pageId: string): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs, db.cards], async () => {
    const p = await db.pages.get(pageId);
    if (!p) return;
    const objs = await db.objects.where("pageId").equals(pageId).toArray();
    await db.objects.where("pageId").equals(pageId).delete();
    const candidates = objs.map((o) => o.blobId).filter((x): x is string => !!x);
    if (p.kind === "ink" && p.background) candidates.push(p.background.blobId);
    if (p.kind === "html" && p.snapshotBlobId) candidates.push(p.snapshotBlobId);
    // remove the page first so its own background no longer counts as a reference
    await db.pages.delete(pageId);
    // duplicated pages share image blobs: only delete blobs nothing references any more
    await db.blobs.bulkDelete(await unreferencedBlobs(candidates));
    await db.strokes.where("pageId").equals(pageId).delete();
    const nb = await db.notebooks.get(p.notebookId);
    if (nb) {
      await db.notebooks.update(nb.id, {
        pageIds: nb.pageIds.filter((x) => x !== pageId),
        bookmarks: nb.bookmarks.filter((x) => x !== pageId),
        updatedAt: now(),
      });
    }
  });
}
