import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { db, newId, now, MAX_HTML_BYTES, type Card, type Notebook, type Page, type PageObject, type Recording } from "../store/schema";
import { newSrs } from "../study/srs";
import type { Stroke } from "../ink/model";

export const BACKUP_EXT = ".opennote";
export const BACKUP_FORMAT = 1;
const NOT_BACKUP = "This file is not an OpenNote backup.";
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024; // 1 GB file
const MAX_ENTRY_BYTES = 256 * 1024 * 1024; // any single unzipped entry

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
  /** Study set cards (absent in older backups). */
  cards?: Card[];
  /** Lecture recordings; audio sits in `blobs/<blobId>` (absent in older backups). */
  recordings?: Recording[];
};

/** Zip one notebook (pages, ink, pictures, live pages) into a .opennote file. */
export async function exportBackup(notebookId: string): Promise<Blob> {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error("Notebook not found");
  const pages = (await db.pages.bulkGet(notebook.pageIds)).filter((p): p is Page => !!p);
  const pageIds = pages.map((p) => p.id);
  const strokeRows = await db.strokes.where("pageId").anyOf(pageIds).toArray();
  const objects = await db.objects.where("pageId").anyOf(pageIds).toArray();
  const cards = await db.cards.where("notebookId").equals(notebookId).toArray();
  const recordings = await db.recordings.where("notebookId").equals(notebookId).toArray();
  const blobIds = [...new Set([...objects.map((o) => o.blobId), ...pages.map((p) => (p.kind === "ink" ? p.background?.blobId : undefined)),
    ...cards.flatMap((c) => [c.frontImage, c.backImage]), ...recordings.map((r) => r.blobId)]
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
    format: "opennote", formatVersion: BACKUP_FORMAT, exportedAt: now(), notebook, pages, objects, blobs, cards, recordings,
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
  const lists = [m.pages, m.strokes, m.objects, m.blobs, m.notebook?.pageIds, m.notebook?.bookmarks];
  if (m.format !== "opennote" || !m.notebook || !lists.every(Array.isArray)) throw new Error(NOT_BACKUP);
  if (m.pages.some((p) => p.kind === "html" && typeof p.source === "string" && p.source.length > MAX_HTML_BYTES)) throw new Error(NOT_BACKUP);
  if (m.formatVersion > BACKUP_FORMAT) throw new Error("This backup was made by a newer OpenNote. Please update the app.");
  return m;
}

/** Import a .opennote file as a NEW notebook (never overwrites). All-or-nothing. */
export async function importBackup(file: Blob): Promise<Notebook> {
  let files: Record<string, Uint8Array>;
  if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup is too large to import.");
  try {
    // only the manifest and pictures; refuse oversized entries (zip bombs)
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => (f.name === "manifest.json" || f.name.startsWith("blobs/")) && f.originalSize <= MAX_ENTRY_BYTES,
    });
  } catch { throw new Error(NOT_BACKUP); }
  const m = readManifest(files);
  const pageMap = new Map(m.pages.map((p) => [p.id, newId()]));
  // only pictures actually inside the file get mapped; a missing one is dropped, never pointed at a local blob
  const blobMap = new Map(m.blobs.filter((b) => files[`blobs/${b.id}`]).map((b) => [b.id, newId()]));
  const t = now();
  const nb: Notebook = {
    ...m.notebook, id: newId(), trashedAt: null, folderId: null, createdAt: t, updatedAt: t,
    pageIds: m.notebook.pageIds.map((id) => pageMap.get(id)).filter((x): x is string => !!x),
    bookmarks: m.notebook.bookmarks.map((id) => pageMap.get(id)).filter((x): x is string => !!x),
  };
  const pages = m.pages.map((p) => {
    const copy = { ...p, id: pageMap.get(p.id)!, notebookId: nb.id } as Page;
    if (copy.kind === "ink" && copy.background) {
      const mapped = blobMap.get(copy.background.blobId);
      if (mapped) copy.background = { ...copy.background, blobId: mapped }; else delete copy.background;
    }
    // a shared file must not switch internet on for live pages: the user decides that per page
    if (copy.kind === "html") { copy.allowNetwork = false; delete copy.snapshotBlobId; }
    return copy;
  });
  const t0 = now();
  // untrusted file: only known document kinds, only real layer lists, only card objects
  if (nb.kind !== "whiteboard" && nb.kind !== "studyset") delete nb.kind;
  for (const p of pages) {
    if (p.kind !== "ink" || p.layers === undefined) continue;
    const ok = Array.isArray(p.layers) && p.layers.length > 0 && p.layers.every((l) => l && typeof l === "object" && typeof l.id === "string" && typeof l.name === "string");
    if (ok) p.layers = p.layers!.map((l) => ({ id: l.id, name: l.name, visible: l.visible !== false, locked: l.locked === true }));
    else delete p.layers;
  }
  const rawCards = (Array.isArray(m.cards) ? m.cards : []).filter((c): c is Card => !!c && typeof c === "object" && !Array.isArray(c));
  const cards: Card[] = rawCards.map((c, i) => ({
    id: newId(), notebookId: nb.id, order: typeof c.order === "number" ? c.order : i + 1,
    front: String(c.front ?? ""), back: String(c.back ?? ""),
    frontImage: c.frontImage ? blobMap.get(c.frontImage) : undefined, backImage: c.backImage ? blobMap.get(c.backImage) : undefined,
    // learning progress is personal: an imported set starts fresh
    srs: newSrs(t0), createdAt: t0, updatedAt: t0,
  }));
  // untrusted file: a recording needs its audio inside the file, and only known fields are kept
  const clipMap = new Map<string, string>();
  const recordings: Recording[] = [];
  for (const r of Array.isArray(m.recordings) ? m.recordings : []) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.blobId !== "string") continue;
    const blobId = blobMap.get(r.blobId);
    if (!blobId) continue;
    const id = newId();
    clipMap.set(r.id, id);
    const segs = Array.isArray(r.transcriptSegments)
      ? r.transcriptSegments.filter((s) => s && typeof s.offsetMs === "number" && typeof s.endMs === "number" && typeof s.text === "string")
        .map((s) => ({ offsetMs: s.offsetMs, endMs: s.endMs, text: s.text }))
      : undefined;
    recordings.push({
      id, notebookId: nb.id, blobId,
      title: String(r.title ?? "Recording"),
      durationMs: Number.isFinite(r.durationMs) ? Math.max(0, r.durationMs) : 0,
      mimeType: typeof r.mimeType === "string" ? r.mimeType : "audio/webm",
      createdAt: Number.isFinite(r.createdAt) ? r.createdAt : t0, updatedAt: t0,
      ...(typeof r.transcript === "string" ? { transcript: r.transcript } : {}),
      ...(typeof r.languageCode === "string" ? { languageCode: r.languageCode } : {}),
      ...(segs ? { transcriptSegments: segs } : {}),
    });
  }
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs, db.cards, db.recordings], async () => {
    await db.cards.bulkAdd(cards);
    for (const b of m.blobs) {
      const bytes = files[`blobs/${b.id}`];
      if (bytes) await db.blobs.add({ id: blobMap.get(b.id)!, data: new Blob([bytes as BlobPart], { type: b.type }) });
    }
    await db.recordings.bulkAdd(recordings);
    await db.notebooks.add(nb);
    await db.pages.bulkAdd(pages);
    await db.strokes.bulkAdd(m.strokes.filter((s) => pageMap.has(s.pageId)).map((s) => {
      const id = newId();
      const { audioSync, ...rest } = s.stroke;
      const clipId = audioSync && Number.isFinite(audioSync.offsetMs) ? clipMap.get(audioSync.clipId) : undefined;
      return {
        id, pageId: pageMap.get(s.pageId)!,
        stroke: { ...rest, id, points: new Float32Array(s.stroke.points), ...(clipId ? { audioSync: { clipId, offsetMs: audioSync!.offsetMs } } : {}) },
      };
    }));
    await db.objects.bulkAdd(m.objects.filter((o) => pageMap.has(o.pageId)).map((o) => ({
      ...o, id: newId(), pageId: pageMap.get(o.pageId)!, blobId: o.blobId ? blobMap.get(o.blobId) : undefined,
    })).filter((o) => o.kind !== "image" || o.blobId));
  });
  return nb;
}
