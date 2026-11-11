import { db, newId, now, PAGE_SIZE, type PageObject } from "../store/schema";
import type { ChartSpec } from "../charts/spec";

const MAX_SIDE = 2048;
const MAX_W = PAGE_SIZE.w * 0.8;

async function touch(pageId: string): Promise<void> {
  const p = await db.pages.get(pageId);
  if (!p) return;
  const t = now();
  await db.pages.update(pageId, { updatedAt: t });
  await db.notebooks.update(p.notebookId, { updatedAt: t });
}

export async function getObjects(pageId: string): Promise<PageObject[]> {
  return (await db.objects.where("pageId").equals(pageId).toArray()).sort((a, b) => a.z - b.z);
}

async function nextZ(pageId: string): Promise<number> {
  const objs = await db.objects.where("pageId").equals(pageId).toArray();
  return objs.reduce((m, o) => Math.max(m, o.z), 0) + 1;
}

/** Downscale to <= 2048 px longest side and re-encode as WebP when a canvas is available. */
async function prepare(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const rawW = Math.max(1, Number.isFinite(bmp.width) && bmp.width > 0 ? bmp.width : 600);
  const rawH = Math.max(1, Number.isFinite(bmp.height) && bmp.height > 0 ? bmp.height : 400);
  const k = Math.min(1, MAX_SIDE / Math.max(rawW, rawH));
  const w = Math.max(1, Math.round(rawW * k));
  const h = Math.max(1, Math.round(rawH * k));
  let blob: Blob = file;
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")?.drawImage(bmp as unknown as CanvasImageSource, 0, 0, w, h);
    blob = await c.convertToBlob({ type: "image/webp", quality: 0.9 });
  }
  bmp.close?.();
  return { blob, w, h };
}

/** Adds an image; `at` is its top-left in logical units (defaults to centred on the page). */
export async function addImage(pageId: string, file: Blob, at?: { x: number; y: number }): Promise<PageObject> {
  const img = await prepare(file);
  const w = Math.min(img.w, MAX_W);
  const h = (w / img.w) * img.h;
  const blobId = newId();
  const validAt = at && Number.isFinite(at.x) && Number.isFinite(at.y) ? at : undefined;
  // Without an explicit spot, cascade new images so they never sit exactly on top of earlier ones.
  const n = validAt ? 0 : await db.objects.where("pageId").equals(pageId).filter((x) => x.kind === "image").count();
  const step = (n % 12) * 36;
  const o: PageObject = {
    id: newId(), pageId, kind: "image", w, h, rotation: 0, blobId, z: await nextZ(pageId),
    x: validAt ? Math.max(0, Math.min(validAt.x, PAGE_SIZE.w - w)) : Math.max(0, Math.min((PAGE_SIZE.w - w) / 2 + step, PAGE_SIZE.w - w)),
    y: validAt ? Math.max(0, validAt.y) : Math.max(0, (PAGE_SIZE.h - h) / 2 + step),
  };
  await db.transaction("rw", [db.blobs, db.objects, db.pages, db.notebooks], async () => {
    await db.blobs.add({ id: blobId, data: img.blob });
    await db.objects.add(o);
    await touch(pageId);
  });
  return o;
}

/**
 * Adds a chart: an ordinary picture (so move, resize, lasso, PDF export and sync all just work) that also keeps the
 * data it was drawn from, so "Edit chart" can redraw it. `png` is drawn at 2x the size it takes on the page.
 */
export async function addChart(pageId: string, chart: ChartSpec, png: { blob: Blob; w: number; h: number }, at?: { x: number; y: number }): Promise<PageObject> {
  const w = Math.min(png.w / 2, MAX_W);
  const h = (w / png.w) * png.h;
  const blobId = newId();
  // like pictures: step each new one down and right so it never lands exactly on an earlier one
  const n = at ? 0 : await db.objects.where("pageId").equals(pageId).filter((x) => x.kind === "image").count();
  const step = (n % 12) * 36;
  const o: PageObject = {
    id: newId(), pageId, kind: "image", w, h, rotation: 0, blobId, chart, z: await nextZ(pageId),
    x: at && Number.isFinite(at.x) ? Math.max(0, Math.min(at.x, PAGE_SIZE.w - w)) : Math.min((PAGE_SIZE.w - w) / 2 + step, PAGE_SIZE.w - w),
    y: at && Number.isFinite(at.y) ? Math.max(0, at.y) : Math.max(0, Math.min((PAGE_SIZE.h - h) / 2 + step, PAGE_SIZE.h - h)),
  };
  await db.transaction("rw", [db.blobs, db.objects, db.pages, db.notebooks], async () => {
    await db.blobs.add({ id: blobId, data: png.blob });
    await db.objects.add(o);
    await touch(pageId);
  });
  return o;
}

/** Redraws an existing chart with new data. Keeps its place and width; the height follows the new picture's shape. */
export async function updateChart(id: string, chart: ChartSpec, png: { blob: Blob; w: number; h: number }): Promise<void> {
  const o = await db.objects.get(id);
  if (!o) return;
  const blobId = newId();
  const h = (o.w / png.w) * png.h;
  await db.transaction("rw", [db.blobs, db.objects, db.pages, db.notebooks], async () => {
    await db.blobs.add({ id: blobId, data: png.blob });
    await db.objects.update(id, { chart, blobId, h, crop: undefined });
    // the old picture is kept: copies of this chart and undo history (an undone move) may still point at it
    await touch(o.pageId);
  });
}

export async function pasteImages(files: Blob[], pageId: string): Promise<number> {
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  for (const f of imgs) await addImage(pageId, f);
  return imgs.length;
}

export async function addTextBox(pageId: string, at: { x: number; y: number }, layerId?: string): Promise<PageObject> {
  const x = Number.isFinite(at.x) ? at.x : 120;
  const y = Number.isFinite(at.y) ? at.y : 120;
  const o: PageObject = { id: newId(), pageId, kind: "textbox", x, y, w: 420, h: 80, rotation: 0, text: "", z: await nextZ(pageId),
    ...(layerId && layerId !== "base" ? { layerId } : {}) };
  await db.objects.add(o);
  await touch(pageId);
  return o;
}

/** Tape covers part of the page; it starts hidden (covering) and is tapped to peel it back. */
export async function addTape(
  pageId: string, r: { x: number; y: number; w: number; h: number }, color: string, layerId?: string,
  /** runs as soon as the tape exists, before the page timestamps update, so undo can never miss it */
  onAdded?: (o: PageObject) => void,
): Promise<PageObject> {
  const o: PageObject = {
    id: newId(), pageId, kind: "tape", x: r.x, y: r.y, w: r.w, h: r.h, rotation: 0, color, revealed: false,
    z: await nextZ(pageId), ...(layerId ? { layerId } : {}),
  };
  await db.objects.add(o);
  onAdded?.(o);
  await touch(pageId);
  return o;
}

export async function setTapeRevealed(id: string, revealed: boolean): Promise<void> {
  await db.objects.update(id, { revealed });
}

export async function setAllTape(pageId: string, revealed: boolean): Promise<void> {
  const tapes = await db.objects.where("pageId").equals(pageId).filter((o) => o.kind === "tape").toArray();
  await db.objects.bulkPut(tapes.map((o) => ({ ...o, revealed })));
}

export async function updateObject(id: string, patch: Partial<Omit<PageObject, "id" | "pageId">>): Promise<void> {
  const o = await db.objects.get(id);
  if (!o) return;
  await db.objects.update(id, patch);
  await touch(o.pageId);
}

export async function putObjects(objs: PageObject[]): Promise<void> {
  if (objs.length === 0) return;
  await db.objects.bulkPut(objs);
  await touch(objs[0].pageId);
}

export async function deleteObjects(ids: string[]): Promise<void> {
  const objs = (await db.objects.bulkGet(ids)).filter((o): o is PageObject => !!o);
  await db.transaction("rw", db.objects, db.blobs, async () => {
    await db.objects.bulkDelete(ids);
    // keep blobs referenced by other objects (duplicates share blobs)
    for (const o of objs) {
      if (!o.blobId) continue;
      const others = await db.objects.filter((x) => x.blobId === o.blobId).count();
      if (others === 0) await db.blobs.delete(o.blobId);
    }
  });
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await db.blobs.get(id))?.data;
}

/** Remove object rows but keep blobs so undo can restore them. */
export async function removeObjectRows(ids: string[]): Promise<void> {
  if (ids.length) await db.objects.bulkDelete(ids);
}
