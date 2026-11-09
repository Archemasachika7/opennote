import type { Stroke } from "../ink/model";
import { db, now } from "./schema";

async function touch(pageId: string): Promise<void> {
  const p = await db.pages.get(pageId);
  if (!p) return;
  const t = now();
  await db.pages.update(pageId, { updatedAt: t });
  await db.notebooks.update(p.notebookId, { updatedAt: t });
}

export async function getStrokes(pageId: string): Promise<Stroke[]> {
  const rows = await db.strokes.where("pageId").equals(pageId).toArray();
  return rows.map((r) => r.stroke);
}

export async function putStroke(pageId: string, s: Stroke): Promise<void> {
  await db.transaction("rw", [db.strokes, db.pages, db.notebooks], async () => {
    await db.strokes.put({ id: s.id, pageId, stroke: s });
    await touch(pageId);
  });
}

export async function replaceStrokes(pageId: string, remove: string[], add: Stroke[]): Promise<void> {
  await db.transaction("rw", [db.strokes, db.pages, db.notebooks], async () => {
    await db.strokes.bulkDelete(remove);
    await db.strokes.bulkPut(add.map((s) => ({ id: s.id, pageId, stroke: s })));
    await touch(pageId);
  });
}
