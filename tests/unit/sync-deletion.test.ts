// @vitest-environment node
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
vi.stubGlobal("Blob", NodeBlob);
import { db } from "../../src/store/schema";
import { createNotebook, renameNotebook, restoreNotebook, trashNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { putStroke } from "../../src/store/strokes";
import { deriveMasterKey, newSalt } from "../../src/sync/crypto";
import { memoryIndex, pullAll, pushNotebook, syncAll, type SyncEnv } from "../../src/sync/engine";
import { deleteEverywhere, getTombstone, listTombstones, removeFromDevice, restoreToDevice } from "../../src/sync/deletion";
import type { BlobStore, ChunkRef } from "../../src/sync/stores/types";

function memStore(): BlobStore & { data: Map<string, Uint8Array> } {
  const data = new Map<string, Uint8Array>();
  return {
    provider: "telegram", data,
    async put(id, chunks) { return chunks.map((c, i) => { data.set(`${id}.${i}`, c); return { ref: `${id}.${i}`, size: c.byteLength }; }); },
    async get(refs: ChunkRef[]) { return refs.map((r) => data.get(r.ref)!); },
    async remove(refs: ChunkRef[]) { for (const r of refs) data.delete(r.ref); },
  };
}

let env: SyncEnv;
let store: ReturnType<typeof memStore>;
const wipeDevice = () => Promise.all(db.tables.map((t) => t.clear()));
const tick = () => new Promise((r) => setTimeout(r, 5));
const titles = async () => (await db.notebooks.toArray()).map((n) => n.title).sort();

beforeEach(async () => {
  await wipeDevice();
  store = memStore();
  env = { index: memoryIndex(), stores: [store], master: await deriveMasterKey("pw", newSalt(), 1000) };
});

async function seed(title = "Bio") {
  const nb = await createNotebook({ title });
  const [ink] = await getPages(nb.id);
  await putStroke(ink.id, { id: "s1", tool: "pen", variant: "ball", color: "#fff", width: 3, points: new Float32Array([1, 2, 0.5, 0]) });
  await pushNotebook(env, nb.id);
  return nb;
}

/** Another device deleting everywhere: the row becomes a purge marker. */
async function purgeRemotely(id: string) {
  const row = (await env.index.getRow(id))!;
  await env.index.casUpdate(id, row.version, { version: row.version + 1, manifest_object: null, deleted_at: new Date().toISOString() });
}

it("delete everywhere: the index row becomes a purge marker and the stored copy is removed", async () => {
  const nb = await seed();
  await deleteEverywhere(nb.id);
  expect(await db.notebooks.get(nb.id)).toBeUndefined();
  await syncAll(env);
  const row = await env.index.getRow(nb.id);
  expect(row?.deleted_at).toBeTruthy();
  expect(row?.manifest_object).toBeNull();
  expect(store.data.size).toBe(0);
  expect(await listTombstones()).toEqual([]);
  // and it never comes back on a later pull
  await syncAll(env);
  expect(await db.notebooks.get(nb.id)).toBeUndefined();
});

it("a notebook deleted everywhere on another device is deleted here, with no conflict copy even after local edits", async () => {
  const nb = await seed();
  await purgeRemotely(nb.id);
  await tick();
  await renameNotebook(nb.id, "Bio edited here"); // this device changed it too
  const r = await syncAll(env);
  expect(r.conflicts).toBe(0);
  expect(await titles()).toEqual([]);
});

it("remove from this device: the account keeps it, it is not downloaded again until asked", async () => {
  const nb = await seed();
  await removeFromDevice(nb.id);
  expect((await getTombstone(nb.id))?.scope).toBe("device");
  await syncAll(env);
  const row = await env.index.getRow(nb.id);
  expect(row?.deleted_at).toBeNull();
  expect(row?.manifest_object).toBeTruthy();
  expect(await db.notebooks.get(nb.id)).toBeUndefined();

  // another device edits it: still not downloaded here
  await env.index.casUpdate(nb.id, row!.version, { version: row!.version + 1, title: "Bio v2" });
  await syncAll(env);
  expect(await db.notebooks.get(nb.id)).toBeUndefined();

  await restoreToDevice(nb.id);
  await syncAll(env);
  expect((await db.notebooks.get(nb.id))?.id).toBe(nb.id);
  expect(await getTombstone(nb.id)).toBeNull();
});

it("a notebook removed from this device is deleted for good if another device deletes it everywhere", async () => {
  const nb = await seed();
  await removeFromDevice(nb.id);
  await purgeRemotely(nb.id);
  await pullAll(env);
  expect(await getTombstone(nb.id)).toBeNull();
});

it("trashed on another device while edited here: goes to Trash here, no conflict copy, stays trashed everywhere", async () => {
  const nb = await seed();
  const row = (await env.index.getRow(nb.id))!;
  await env.index.casUpdate(nb.id, row.version, { version: row.version + 1, deleted_at: new Date().toISOString() });
  await tick();
  await renameNotebook(nb.id, "Bio edited here");
  const r = await syncAll(env);
  expect(r.conflicts).toBe(0);
  expect(await titles()).toEqual(["Bio edited here"]);
  expect((await db.notebooks.get(nb.id))?.trashedAt).toBeTruthy();
  expect((await env.index.getRow(nb.id))?.deleted_at).toBeTruthy(); // our edits went up, the deletion stayed
});

it("trashed here while another device edited it: their edits are kept, it stays in Trash, no conflict copy", async () => {
  const nb = await seed();
  const row = (await env.index.getRow(nb.id))!;
  await tick();
  await trashNotebook(nb.id);
  await env.index.casUpdate(nb.id, row.version, { version: row.version + 1, title: "Bio (other)" });
  const r = await syncAll(env);
  expect(r.conflicts).toBe(0);
  expect((await db.notebooks.toArray()).length).toBe(1);
  expect((await db.notebooks.get(nb.id))?.trashedAt).toBeTruthy();
  expect((await env.index.getRow(nb.id))?.deleted_at).toBeTruthy();
});

it("restoring from Trash syncs the restore", async () => {
  const nb = await seed();
  await tick();
  await trashNotebook(nb.id);
  await pushNotebook(env, nb.id);
  expect((await env.index.getRow(nb.id))?.deleted_at).toBeTruthy();
  await tick();
  await restoreNotebook(nb.id);
  expect(await pushNotebook(env, nb.id)).toBe("pushed");
  expect((await env.index.getRow(nb.id))?.deleted_at).toBeNull();
});

it("deleting a notebook that was never synced leaves no tombstone", async () => {
  const nb = await createNotebook({ title: "Local only" });
  await deleteEverywhere(nb.id);
  expect(await listTombstones()).toEqual([]);
});
