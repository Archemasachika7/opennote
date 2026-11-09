import { db, newId, now, PAGE_SIZE, MAX_HTML_BYTES, type NewPage, type Page, type PagePatch } from "./schema";

export const TOO_LARGE = "Too large (max 5 MB)";

function build(notebookId: string, init: NewPage): Page {
  const t = now();
  const base = { id: newId(), notebookId, createdAt: t, updatedAt: t, size: { ...PAGE_SIZE } };
  switch (init.kind) {
    case "ink": return {
      ...base, kind: "ink", template: init.template, ...(init.size ? { size: { ...init.size } } : {}),
      ...(init.background ? { background: { ...init.background } } : {}),
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

export async function deletePage(pageId: string): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs], async () => {
    const p = await db.pages.get(pageId);
    if (!p) return;
    const objs = await db.objects.where("pageId").equals(pageId).toArray();
    await db.objects.where("pageId").equals(pageId).delete();
    // Duplicated pages share image blobs: only delete blobs no remaining object references.
    const candidates = [...new Set(objs.map((o) => o.blobId).filter((x): x is string => !!x))];
    const stillUsed = new Set((await db.objects.filter((o) => !!o.blobId && candidates.includes(o.blobId)).toArray()).map((o) => o.blobId));
    const blobIds = candidates.filter((b) => !stillUsed.has(b));
    if (p.kind === "html" && p.snapshotBlobId) blobIds.push(p.snapshotBlobId);
    await db.blobs.bulkDelete(blobIds);
    await db.strokes.where("pageId").equals(pageId).delete();
    await db.pages.delete(pageId);
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
