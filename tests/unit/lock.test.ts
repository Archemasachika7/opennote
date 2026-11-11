// @vitest-environment node
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
vi.stubGlobal("Blob", NodeBlob);
import { db } from "../../src/store/schema";
import { createNotebook, deleteNotebook, toggleFavorite } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { lockNotebook, packSealed, unlockNotebook, unpackSealed } from "../../src/store/lock";
import { exportBackup, importBackup } from "../../src/io/backup";

const ITER = 1000; // tests only: the app uses 600k rounds
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

async function seed() {
  const nb = await createNotebook({ title: "Diary" });
  const [p] = await getPages(nb.id);
  await putStroke(p.id, { id: "s1", tool: "pen", variant: "ball", color: "#fff", width: 3, points: new Float32Array([1, 2, 0.5, 0, 9, 9, 0.5, 5]) });
  return { nb, pageId: p.id };
}

it("packs and unpacks the encrypted container exactly", () => {
  const s = { wrappedKey: new Uint8Array([1, 2, 3]), chunks: [new Uint8Array([4, 5]), new Uint8Array([6])] };
  const back = unpackSealed(packSealed(s));
  expect(Array.from(back.wrappedKey)).toEqual([1, 2, 3]);
  expect(back.chunks.map((c) => Array.from(c))).toEqual([[4, 5], [6]]);
  expect(() => unpackSealed(new Uint8Array([0, 0, 0, 9]))).toThrow();
});

it("locking removes every readable page and stroke, leaving one encrypted blob", async () => {
  const { nb, pageId } = await seed();
  await lockNotebook(nb.id, "secret pw", ITER);
  const locked = await db.notebooks.get(nb.id);
  expect(locked?.locked?.blobId).toBeTruthy();
  expect(locked?.pageIds).toEqual([]);
  expect(await db.pages.get(pageId)).toBeUndefined();
  expect(await getStrokes(pageId)).toEqual([]);
  const blob = await db.blobs.get(locked!.locked!.blobId);
  const bytes = Buffer.from(await blob!.data.arrayBuffer());
  expect(bytes.includes(Buffer.from("Diary"))).toBe(false); // nothing readable inside
});

it("a wrong password is refused; the right one brings everything back, keeping favourites and the title", async () => {
  const { nb, pageId } = await seed();
  await lockNotebook(nb.id, "secret pw", ITER);
  await toggleFavorite(nb.id); // changed while locked
  await expect(unlockNotebook(nb.id, "nope")).rejects.toThrow(/Wrong password/);
  await unlockNotebook(nb.id, "secret pw");
  const back = await db.notebooks.get(nb.id);
  expect(back?.locked).toBeUndefined();
  expect(back?.favorite).toBe(true);
  expect(back?.pageIds).toEqual([pageId]);
  expect((await getStrokes(pageId)).map((s) => s.id)).toEqual(["s1"]);
  expect(await db.blobs.count()).toBe(0); // the encrypted copy is gone once unlocked
});

it("a locked notebook backs up and syncs as its encrypted blob, and unlocks on the other device", async () => {
  const { nb } = await seed();
  await lockNotebook(nb.id, "secret pw", ITER);
  const file = await exportBackup(nb.id);
  await Promise.all(db.tables.map((t) => t.clear())); // "the other device"
  const copy = await importBackup(file, { keepIds: true });
  expect(copy.locked).toBeTruthy();
  await unlockNotebook(copy.id, "secret pw");
  const [p] = await getPages(copy.id);
  expect((await getStrokes(p.id)).map((s) => s.id)).toEqual(["s1"]);
});

it("deleting a locked notebook deletes its encrypted contents too", async () => {
  const { nb } = await seed();
  await lockNotebook(nb.id, "secret pw", ITER);
  await deleteNotebook(nb.id);
  expect(await db.blobs.count()).toBe(0);
});
