import { db, newId, now, PAGE_SIZE, type Notebook, type Paper } from "./schema";

const COVERS = ["#F5A524", "#3DDC97", "#FF8A5B", "#5BB8FF", "#4FD1C5", "#E8697A"];

export async function createNotebook(input: { title: string; folderId?: string | null; paper?: Paper }): Promise<Notebook> {
  const t = now();
  const pageId = newId();
  const count = await db.notebooks.count();
  const nb: Notebook = {
    id: newId(), title: input.title, coverColor: COVERS[count % COVERS.length], paper: input.paper ?? "dark",
    folderId: input.folderId ?? null, bookmarks: [], pageIds: [pageId], createdAt: t, updatedAt: t,
  };
  await db.transaction("rw", db.notebooks, db.pages, async () => {
    await db.notebooks.add(nb);
    await db.pages.add({ id: pageId, notebookId: nb.id, kind: "ink", template: "blank", createdAt: t, updatedAt: t, size: { ...PAGE_SIZE } });
  });
  return nb;
}

export const getNotebook = (id: string): Promise<Notebook | undefined> => db.notebooks.get(id);

export async function renameNotebook(id: string, title: string): Promise<void> {
  await db.notebooks.update(id, { title, updatedAt: now() });
}

export async function updateNotebook(id: string, patch: Partial<Pick<Notebook, "paper" | "coverColor" | "folderId">>): Promise<void> {
  await db.notebooks.update(id, { ...patch, updatedAt: now() });
}

export async function deleteNotebook(id: string): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs], async () => {
    const pageIds = (await db.pages.where("notebookId").equals(id).primaryKeys()) as string[];
    const objs = await db.objects.where("pageId").anyOf(pageIds).toArray();
    const pages = await db.pages.bulkGet(pageIds);
    const blobIds = [
      ...objs.map((o) => o.blobId),
      ...pages.map((p) => (p && p.kind === "html" ? p.snapshotBlobId : undefined)),
    ].filter((x): x is string => !!x);
    await db.blobs.bulkDelete(blobIds);
    await db.objects.where("pageId").anyOf(pageIds).delete();
    await db.strokes.where("pageId").anyOf(pageIds).delete();
    await db.pages.bulkDelete(pageIds);
    await db.notebooks.delete(id);
  });
}

export async function listNotebooks(opts: { folderId?: string | null; sort?: "updated" | "title" } = {}): Promise<Notebook[]> {
  let all = await db.notebooks.toArray();
  if (opts.folderId !== undefined) all = all.filter((n) => n.folderId === opts.folderId);
  return opts.sort === "title"
    ? all.sort((a, b) => a.title.localeCompare(b.title))
    : all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function toggleBookmark(notebookId: string, pageId: string): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const nb = await db.notebooks.get(notebookId);
    if (!nb) return;
    const bookmarks = nb.bookmarks.includes(pageId) ? nb.bookmarks.filter((x) => x !== pageId) : [...nb.bookmarks, pageId];
    await db.notebooks.update(notebookId, { bookmarks });
  });
}
