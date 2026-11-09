import { db, newId, now, PAGE_SIZE, type PageObject } from "../store/schema";

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
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
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
  const o: PageObject = {
    id: newId(), pageId, kind: "image", w, h, rotation: 0, blobId, z: await nextZ(pageId),
    x: at ? Math.min(at.x, PAGE_SIZE.w - w) : (PAGE_SIZE.w - w) / 2,
    y: at ? at.y : (PAGE_SIZE.h - h) / 2,
  };
  await db.transaction("rw", [db.blobs, db.objects, db.pages, db.notebooks], async () => {
    await db.blobs.add({ id: blobId, data: img.blob });
    await db.objects.add(o);
    await touch(pageId);
  });
  return o;
}

export async function pasteImages(files: Blob[], pageId: string): Promise<number> {
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  for (const f of imgs) await addImage(pageId, f);
  return imgs.length;
}

export async function addTextBox(pageId: string, at: { x: number; y: number }): Promise<PageObject> {
  const o: PageObject = { id: newId(), pageId, kind: "textbox", x: at.x, y: at.y, w: 420, h: 80, rotation: 0, text: "", z: await nextZ(pageId) };
  await db.objects.add(o);
  await touch(pageId);
  return o;
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
