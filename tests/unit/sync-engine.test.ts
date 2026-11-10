// @vitest-environment node
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
vi.stubGlobal("Blob", NodeBlob);
import { db } from "../../src/store/schema";
import { createNotebook, renameNotebook, trashNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { deriveMasterKey, newSalt } from "../../src/sync/crypto";
import { memoryIndex, pullAll, pushNotebook, syncAll, type SyncEnv } from "../../src/sync/engine";
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

beforeEach(async () => {
  await wipeDevice();
  store = memStore();
  env = { index: memoryIndex(), stores: [store], master: await deriveMasterKey("pw", newSalt(), 1000) };
});

async function seed(title = "Bio") {
  const nb = await createNotebook({ title });
  const [ink] = await getPages(nb.id);
  await putStroke(ink.id, { id: "s1", tool: "pen", variant: "fountain", color: "#fff", width: 3, points: new Float32Array([1, 2, 0.5, 0]) });
  return nb;
}

it("pushes an encrypted snapshot and records it in the index", async () => {
  const nb = await seed("Secret Biology");
  expect(await pushNotebook(env, nb.id)).toBe("pushed");
  const row = await env.index.getRow(nb.id);
  expect(row).toMatchObject({ id: nb.id, version: 1, deleted_at: null });
  const bytes = Buffer.concat([...store.data.values()].map((u) => Buffer.from(u)));
  expect(bytes.includes(Buffer.from("Secret Biology"))).toBe(false); // ciphertext only
  expect(await pushNotebook(env, nb.id)).toBe("clean"); // nothing changed, nothing uploaded
});

it("a second device pulls the notebook with the same ids and content", async () => {
  const nb = await seed();
  await pushNotebook(env, nb.id);
  await wipeDevice(); // "device B"
  const r = await pullAll(env);
  expect(r.pulled).toBe(1);
  const copy = await db.notebooks.get(nb.id);
  expect(copy?.title).toBe("Bio");
  const [p] = await getPages(nb.id);
  const [s] = await getStrokes(p.id);
  expect(s.id).toBe("s1");
  expect(await pushNotebook(env, nb.id)).toBe("clean"); // a pull must not bounce back as a push
});

it("edits push as a new version and replace the old snapshot", async () => {
  const nb = await seed();
  await pushNotebook(env, nb.id);
  const before = store.data.size;
  await new Promise((r) => setTimeout(r, 5));
  await renameNotebook(nb.id, "Bio 2");
  expect(await pushNotebook(env, nb.id)).toBe("pushed");
  expect((await env.index.getRow(nb.id))?.version).toBe(2);
  expect(store.data.size).toBe(before); // old chunks removed
});

it("keeps both sides on a conflict: the remote version arrives as a conflict copy", async () => {
  const nb = await seed();
  await pushNotebook(env, nb.id);
  // another device pushed version 2 meanwhile
  const row = (await env.index.getRow(nb.id))!;
  await env.index.casUpdate(nb.id, row.version, { version: row.version + 1, title: "Bio (other device)" });
  await new Promise((r) => setTimeout(r, 5));
  await renameNotebook(nb.id, "Bio (this device)");
  const result = await syncAll(env);
  expect(result.conflicts).toBe(1);
  const titles = (await db.notebooks.toArray()).map((n) => n.title).sort();
  expect(titles).toEqual(["Bio (conflict copy)", "Bio (this device)"]);
  expect((await env.index.getRow(nb.id))?.version).toBe(3); // ours went up after keeping theirs
});

it("a notebook deleted on another device goes to this device's Trash", async () => {
  const nb = await seed();
  await pushNotebook(env, nb.id);
  const row = (await env.index.getRow(nb.id))!;
  await env.index.casUpdate(nb.id, row.version, { version: row.version + 1, deleted_at: new Date().toISOString() });
  await pullAll(env);
  expect((await db.notebooks.get(nb.id))?.trashedAt).toBeTruthy();
});

it("trashing locally pushes the deletion", async () => {
  const nb = await seed();
  await pushNotebook(env, nb.id);
  await new Promise((r) => setTimeout(r, 5));
  await trashNotebook(nb.id);
  await pushNotebook(env, nb.id);
  expect((await env.index.getRow(nb.id))?.deleted_at).toBeTruthy();
});
