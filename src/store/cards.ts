import { db, newId, now, unreferencedBlobs, type Card } from "./schema";
import { newSrs, review, type Grade } from "../study/srs";
import { reviewFsrs, type SrsWithFsrs } from "../study/fsrs";

async function touch(notebookId: string): Promise<void> {
  await db.notebooks.update(notebookId, { updatedAt: now() });
}

export async function listCards(notebookId: string): Promise<Card[]> {
  return (await db.cards.where("notebookId").equals(notebookId).toArray()).sort((a, b) => a.order - b.order);
}

export async function addCard(notebookId: string, init: { front?: string; back?: string } = {}): Promise<Card> {
  const t = now();
  const last = (await listCards(notebookId)).at(-1);
  const c: Card = {
    id: newId(), notebookId, order: (last?.order ?? 0) + 1, front: init.front ?? "", back: init.back ?? "",
    srs: newSrs(t), createdAt: t, updatedAt: t,
  };
  await db.cards.add(c);
  await touch(notebookId);
  return c;
}

export async function updateCard(id: string, patch: Partial<Pick<Card, "front" | "back" | "frontImage" | "backImage">>): Promise<void> {
  const c = await db.cards.get(id);
  if (!c) return;
  await db.cards.update(id, { ...patch, updatedAt: now() });
  await touch(c.notebookId);
}

export type DeletedCardSnapshot = { card: Card; blobs: { id: string; data: Blob }[] };

export async function deleteCardWithUndo(id: string): Promise<DeletedCardSnapshot | null> {
  const c = await db.cards.get(id);
  if (!c) return null;
  const ids = [c.frontImage, c.backImage].filter((x): x is string => !!x);
  const blobs = (await db.blobs.bulkGet(ids)).filter((b): b is { id: string; data: Blob } => !!b);
  await deleteCard(id);
  return { card: c, blobs };
}

export async function restoreDeletedCard(snap: DeletedCardSnapshot): Promise<void> {
  await db.transaction("rw", [db.cards, db.blobs, db.notebooks], async () => {
    for (const b of snap.blobs) {
      if (!(await db.blobs.get(b.id))) await db.blobs.put(b);
    }
    await db.cards.put(snap.card);
    await touch(snap.card.notebookId);
  });
}

export async function deleteCard(id: string): Promise<void> {
  await db.transaction("rw", [db.cards, db.notebooks, db.blobs, db.objects, db.pages], async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    await db.cards.delete(id);
    await db.blobs.bulkDelete(await unreferencedBlobs([c.frontImage, c.backImage].filter((x): x is string => !!x)));
    await touch(c.notebookId);
  });
}

/** Move the card at index `from` to index `to`, renumbering the set. */
export async function moveCard(notebookId: string, from: number, to: number): Promise<void> {
  await db.transaction("rw", db.cards, db.notebooks, async () => {
    const list = await listCards(notebookId);
    const [c] = list.splice(from, 1);
    if (!c) return;
    list.splice(Math.max(0, Math.min(to, list.length)), 0, c);
    await db.cards.bulkPut(list.map((x, i) => ({ ...x, order: i + 1 })));
    await touch(notebookId);
  });
}

export async function reviewCard(id: string, grade: Grade, at: number = now(), algo: "sm2" | "fsrs" = "sm2"): Promise<void> {
  const c = await db.cards.get(id);
  if (!c) return;
  const nextSrs = algo === "fsrs" ? reviewFsrs(c.srs as SrsWithFsrs, grade, at) : review(c.srs, grade, at);
  await db.cards.update(id, { srs: nextSrs });
}

/** Attach a picture to one side of a card (replacing any earlier one). */
export async function setCardImage(id: string, side: "front" | "back", file: Blob | null): Promise<void> {
  const c = await db.cards.get(id);
  if (!c) return;
  const key = side === "front" ? "frontImage" : "backImage";
  const old = c[key];
  let blobId: string | undefined;
  if (file) { blobId = newId(); await db.blobs.add({ id: blobId, data: file }); }
  await db.cards.update(id, { [key]: blobId, updatedAt: now() });
  if (old) await db.blobs.bulkDelete(await unreferencedBlobs([old]));
}

/** Forget all learning progress of a set. */
export async function resetProgress(notebookId: string): Promise<void> {
  const t = now();
  const list = await listCards(notebookId);
  await db.cards.bulkPut(list.map((c) => ({ ...c, srs: newSrs(t) })));
}
