/**
 * Password-locked notebooks (S Note had these). Locking really encrypts: the whole notebook (pages,
 * ink, pictures, cards, recordings) is packed into the .opennote backup format, encrypted with a key
 * made from the password (PBKDF2-SHA-256, 600k rounds, AES-256-GCM, the same crypto as sync), stored as
 * one blob, and the readable copy is removed from the device. Unlocking decrypts it and puts it back.
 * A locked notebook syncs and backs up as that encrypted blob. There is no recovery: a forgotten
 * password means the notebook can't be opened.
 */
import { db, newId, now, type LockInfo } from "./schema";
import { exportBackup, importBackup } from "../io/backup";
import { checkPassphrase, decryptBlob, deriveMasterKey, encryptBlob, makeKeyCheck, newSalt, PBKDF2_ITERATIONS, type SealedBlob } from "../sync/crypto";

const MIME = "application/x-opennote-locked";
export const MIN_PASSWORD = 4;

const b64 = (u: Uint8Array) => btoa(Array.from(u, (b) => String.fromCharCode(b)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** [u32 key length][key][u32 chunk count]([u32 length][chunk])… */
export function packSealed(s: SealedBlob): Uint8Array {
  const size = 8 + s.wrappedKey.length + s.chunks.reduce((n, c) => n + 4 + c.length, 0);
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  let at = 0;
  const u32 = (v: number) => { view.setUint32(at, v); at += 4; };
  const bytes = (b: Uint8Array) => { out.set(b, at); at += b.length; };
  u32(s.wrappedKey.length); bytes(s.wrappedKey);
  u32(s.chunks.length);
  for (const c of s.chunks) { u32(c.length); bytes(c); }
  return out;
}

export function unpackSealed(u: Uint8Array): SealedBlob {
  const view = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let at = 0;
  const u32 = () => { if (at + 4 > u.length) throw new Error("damaged"); const v = view.getUint32(at); at += 4; return v; };
  const take = (n: number) => { if (at + n > u.length) throw new Error("damaged"); const b = u.slice(at, at + n); at += n; return b; };
  const wrappedKey = take(u32());
  const n = u32();
  if (n > 10_000) throw new Error("damaged");
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < n; i++) chunks.push(take(u32()));
  return { wrappedKey, chunks };
}

export async function lockNotebook(id: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<void> {
  const nb = await db.notebooks.get(id);
  if (!nb) throw new Error("Notebook not found.");
  if (nb.locked) throw new Error("This notebook is already locked.");
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
  const zip = new Uint8Array(await (await exportBackup(id)).arrayBuffer());
  const salt = newSalt();
  const key = await deriveMasterKey(password, salt, iterations);
  const sealed = packSealed(await encryptBlob(zip, key));
  const lock: LockInfo = { blobId: newId(), salt: b64(salt), check: b64(await makeKeyCheck(key)), iterations, lockedAt: now() };

  // one transaction: the encrypted copy is stored before anything readable is removed
  await db.transaction("rw", [db.notebooks, db.pages, db.strokes, db.objects, db.blobs, db.cards, db.recordings], async () => {
    await db.blobs.put({ id: lock.blobId, data: new Blob([sealed as BlobPart], { type: MIME }) });
    const recs = await db.recordings.where("notebookId").equals(id).toArray();
    const pageIds = (await db.pages.where("notebookId").equals(id).primaryKeys()) as string[];
    const pages = await db.pages.bulkGet(pageIds);
    const objs = await db.objects.where("pageId").anyOf(pageIds).toArray();
    const cards = await db.cards.where("notebookId").equals(id).toArray();
    const blobIds = [
      ...recs.map((r) => r.blobId), ...objs.map((o) => o.blobId), ...cards.flatMap((c) => [c.frontImage, c.backImage]),
      ...pages.map((p) => (p && p.kind === "html" ? p.snapshotBlobId : p && p.kind === "ink" ? p.background?.blobId : undefined)),
    ].filter((x): x is string => !!x);
    await db.recordings.where("notebookId").equals(id).delete();
    await db.cards.where("notebookId").equals(id).delete();
    await db.objects.where("pageId").anyOf(pageIds).delete();
    await db.strokes.where("pageId").anyOf(pageIds).delete();
    await db.pages.bulkDelete(pageIds);
    await db.blobs.bulkDelete(blobIds);
    await db.notebooks.update(id, { pageIds: [], bookmarks: [], locked: lock, updatedAt: now() });
  });
}

/** Check the password and put the notebook back as it was (folder, favourite, title and cover kept). */
export async function unlockNotebook(id: string, password: string): Promise<void> {
  const nb = await db.notebooks.get(id);
  if (!nb?.locked) throw new Error("This notebook isn't locked.");
  const lock = nb.locked;
  const key = await deriveMasterKey(password, unb64(lock.salt), lock.iterations);
  if (!(await checkPassphrase(key, unb64(lock.check)))) throw new Error("Wrong password.");
  const row = await db.blobs.get(lock.blobId);
  if (!row) throw new Error("This notebook's locked contents are missing on this device. Sync it or restore a backup.");
  let zip: Uint8Array;
  try { zip = await decryptBlob(unpackSealed(new Uint8Array(await row.data.arrayBuffer())), key); }
  catch { throw new Error("This notebook's locked contents are damaged."); }
  await importBackup(new Blob([zip as BlobPart], { type: "application/zip" }), { keepIds: true });
  // things the person may have changed while it was locked, and what the import resets
  await db.notebooks.update(id, {
    title: nb.title, coverColor: nb.coverColor, folderId: nb.folderId, favorite: nb.favorite, trashedAt: nb.trashedAt ?? null,
    locked: undefined, updatedAt: now(),
  });
  await db.blobs.delete(lock.blobId);
}
