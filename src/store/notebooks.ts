import { db, newId, now, PAGE_SIZE, unreferencedBlobs, type DocKind, type Notebook, type Paper } from "./schema";

export const COVERS = ["#F5A524", "#3DDC97", "#FF8A5B", "#5BB8FF", "#4FD1C5", "#E8697A"];

export async function createNotebook(input: { title: string; folderId?: string | null; paper?: Paper; kind?: DocKind }): Promise<Notebook> {
  const t = now();
  const pageId = newId();
  const count = await db.notebooks.count();
  const kind = input.kind ?? "notebook";
  const nb: Notebook = {
    id: newId(), title: input.title, coverColor: COVERS[count % COVERS.length], paper: input.paper ?? "dark",
    folderId: input.folderId ?? null, bookmarks: [], pageIds: kind === "studyset" ? [] : [pageId], createdAt: t, updatedAt: t,
    ...(kind !== "notebook" ? { kind } : {}),
  };
  await db.transaction("rw", db.notebooks, db.pages, async () => {
    await db.notebooks.add(nb);
    if (kind === "notebook") {
      await db.pages.add({ id: pageId, notebookId: nb.id, kind: "ink", template: "blank", createdAt: t, updatedAt: t, size: { ...PAGE_SIZE } });
    } else if (kind === "whiteboard") {
      await db.pages.add({ id: pageId, notebookId: nb.id, kind: "ink", template: "dot", board: true, title: "Board 1", createdAt: t, updatedAt: t, size: { ...PAGE_SIZE } });
    }
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
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs, db.cards], async () => {
    const pageIds = (await db.pages.where("notebookId").equals(id).primaryKeys()) as string[];
    const objs = await db.objects.where("pageId").anyOf(pageIds).toArray();
    const pages = await db.pages.bulkGet(pageIds);
    const cards = await db.cards.where("notebookId").equals(id).toArray();
    await db.cards.where("notebookId").equals(id).delete();
    const candidates = [
      ...cards.flatMap((c) => [c.frontImage, c.backImage]),
      ...objs.map((o) => o.blobId),
      ...pages.map((p) => (p && p.kind === "html" ? p.snapshotBlobId : p && p.kind === "ink" ? p.background?.blobId : undefined)),
    ].filter((x): x is string => !!x);
    await db.objects.where("pageId").anyOf(pageIds).delete();
    await db.strokes.where("pageId").anyOf(pageIds).delete();
    await db.pages.bulkDelete(pageIds);
    await db.blobs.bulkDelete(await unreferencedBlobs(candidates));
    await db.notebooks.delete(id);
  });
}

export type LibrarySort = "updated" | "created" | "title" | "pages";
export type LibraryView = "all" | "favorites" | "trash";

export async function listNotebooks(opts: { folderId?: string | null; sort?: LibrarySort; view?: LibraryView; kind?: DocKind } = {}): Promise<Notebook[]> {
  const view = opts.view ?? "all";
  let all = (await db.notebooks.toArray()).filter((n) => (view === "trash" ? !!n.trashedAt : !n.trashedAt));
  if (view === "favorites") all = all.filter((n) => n.favorite);
  if (opts.kind) all = all.filter((n) => (n.kind ?? "notebook") === opts.kind);
  if (opts.folderId !== undefined && view !== "trash") all = all.filter((n) => n.folderId === opts.folderId);
  const by: Record<LibrarySort, (a: Notebook, b: Notebook) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    created: (a, b) => b.createdAt - a.createdAt,
    updated: (a, b) => b.updatedAt - a.updatedAt,
    pages: (a, b) => b.pageIds.length - a.pageIds.length,
  };
  return all.sort(view === "trash" ? (a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0) : by[opts.sort ?? "updated"]);
}

export async function toggleFavorite(id: string): Promise<void> {
  const nb = await db.notebooks.get(id);
  if (nb) await db.notebooks.update(id, { favorite: !nb.favorite });
}

/** Bulk favourite: set every given notebook to the same state. */
export async function setFavorite(ids: string[], favorite: boolean): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => { for (const id of ids) await db.notebooks.update(id, { favorite }); });
}

/** Delete = move to Trash (restorable). `at` is only for tests. */
export async function trashNotebook(id: string, at: number = now()): Promise<void> {
  await db.notebooks.update(id, { trashedAt: at });
}

export async function restoreNotebook(id: string): Promise<void> {
  await db.notebooks.update(id, { trashedAt: null });
}

export const TRASH_DAYS = 30;
/** Permanently delete notebooks that have been in Trash longer than 30 days. Returns how many. */
export async function purgeTrash(maxAgeDays: number = TRASH_DAYS): Promise<number> {
  const cutoff = now() - maxAgeDays * 864e5;
  const old = (await db.notebooks.toArray()).filter((n) => n.trashedAt && n.trashedAt < cutoff);
  for (const n of old) await deleteNotebook(n.id);
  return old.length;
}

export async function moveNotebooks(ids: string[], folderId: string | null): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    for (const id of ids) await db.notebooks.update(id, { folderId });
  });
}

export async function toggleBookmark(notebookId: string, pageId: string): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const nb = await db.notebooks.get(notebookId);
    if (!nb) return;
    const bookmarks = nb.bookmarks.includes(pageId) ? nb.bookmarks.filter((x) => x !== pageId) : [...nb.bookmarks, pageId];
    await db.notebooks.update(notebookId, { bookmarks });
  });
}
