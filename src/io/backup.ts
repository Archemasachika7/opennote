import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { db, newId, now, type Notebook, type Page, type PageObject } from "../store/schema";
import type { Stroke } from "../ink/model";

export const BACKUP_EXT = ".opennote";
export const BACKUP_FORMAT = 1;
const NOT_BACKUP = "This file is not an OpenNote backup.";

type StrokeJson = Omit<Stroke, "points"> & { points: number[] };
type Manifest = {
  format: "opennote";
  formatVersion: number;
  exportedAt: number;
  notebook: Notebook;
  pages: Page[];
  strokes: { pageId: string; stroke: StrokeJson }[];
  objects: PageObject[];
  blobs: { id: string; type: string }[];
};

/** Zip one notebook (pages, ink, pictures, live pages) into a .opennote file. */
export async function exportBackup(notebookId: string): Promise<Blob> {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error("Notebook not found");
  const pages = (await db.pages.bulkGet(notebook.pageIds)).filter((p): p is Page => !!p);
  const pageIds = pages.map((p) => p.id);
  const strokeRows = await db.strokes.where("pageId").anyOf(pageIds).toArray();
  const objects = await db.objects.where("pageId").anyOf(pageIds).toArray();
  const blobIds = [...new Set([...objects.map((o) => o.blobId), ...pages.map((p) => (p.kind === "ink" ? p.background?.blobId : undefined))]
    .filter((x): x is string => !!x))];
  const files: Record<string, Uint8Array> = {};
  const blobs: Manifest["blobs"] = [];
  for (const id of blobIds) {
    const row = await db.blobs.get(id);
    if (!row) continue;
    files[`blobs/${id}`] = new Uint8Array(await row.data.arrayBuffer());
    blobs.push({ id, type: row.data.type });
  }
  const manifest: Manifest = {
    format: "opennote", formatVersion: BACKUP_FORMAT, exportedAt: now(), notebook, pages, objects, blobs,
    strokes: strokeRows.map((r) => ({ pageId: r.pageId, stroke: { ...r.stroke, points: Array.from(r.stroke.points) } })),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" });
}

function readManifest(files: Record<string, Uint8Array>): Manifest {
  const raw = files["manifest.json"];
  if (!raw) throw new Error(NOT_BACKUP);
  let m: Manifest;
  try { m = JSON.parse(strFromU8(raw)) as Manifest; } catch { throw new Error(NOT_BACKUP); }
  if (m.format !== "opennote" || !m.notebook || !Array.isArray(m.pages)) throw new Error(NOT_BACKUP);
  if (m.formatVersion > BACKUP_FORMAT) throw new Error("This backup was made by a newer OpenNote. Please update the app.");
  return m;
}

/** Import a .opennote file as a NEW notebook (never overwrites). All-or-nothing. */
export async function importBackup(file: Blob): Promise<Notebook> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error(NOT_BACKUP); }
  const m = readManifest(files);
  const pageMap = new Map(m.pages.map((p) => [p.id, newId()]));
  const blobMap = new Map(m.blobs.map((b) => [b.id, newId()]));
  const t = now();
  const nb: Notebook = {
    ...m.notebook, id: newId(), trashedAt: null, folderId: null, createdAt: t, updatedAt: t,
    pageIds: m.notebook.pageIds.map((id) => pageMap.get(id)).filter((x): x is string => !!x),
    bookmarks: m.notebook.bookmarks.map((id) => pageMap.get(id)).filter((x): x is string => !!x),
  };
  const pages = m.pages.map((p) => {
    const copy = { ...p, id: pageMap.get(p.id)!, notebookId: nb.id } as Page;
    if (copy.kind === "ink" && copy.background) copy.background = { ...copy.background, blobId: blobMap.get(copy.background.blobId) ?? copy.background.blobId };
    return copy;
  });
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs], async () => {
    for (const b of m.blobs) {
      const bytes = files[`blobs/${b.id}`];
      if (bytes) await db.blobs.add({ id: blobMap.get(b.id)!, data: new Blob([bytes as BlobPart], { type: b.type }) });
    }
    await db.notebooks.add(nb);
    await db.pages.bulkAdd(pages);
    await db.strokes.bulkAdd(m.strokes.filter((s) => pageMap.has(s.pageId)).map((s) => {
      const id = newId();
      return { id, pageId: pageMap.get(s.pageId)!, stroke: { ...s.stroke, id, points: new Float32Array(s.stroke.points) } };
    }));
    await db.objects.bulkAdd(m.objects.filter((o) => pageMap.has(o.pageId)).map((o) => ({
      ...o, id: newId(), pageId: pageMap.get(o.pageId)!, blobId: o.blobId ? blobMap.get(o.blobId) ?? o.blobId : undefined,
    })));
  });
  return nb;
}
