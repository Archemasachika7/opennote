/**
 * Sync engine (storage design §6). Local-first: Dexie stays the truth and sync only moves encrypted
 * notebook snapshots (.opennote format) through the tiered stores, with Supabase holding a small index.
 *
 * push: notebook changed since last sync → encrypt → store → index row with compare-and-swap on `version`
 * pull: index rows newer than our version → fetch → decrypt → replace locally (same ids)
 * conflict (both sides changed): the remote copy arrives as "<title> (conflict copy)", then ours wins the index.
 */
import { db, newId } from "../store/schema";
import { deleteNotebook, renameNotebook, trashNotebook } from "../store/notebooks";
import { exportBackup, importBackup } from "../io/backup";
import { decryptBlob, encryptBlob, sha256Hex } from "./crypto";
import { putTiered } from "./stores/router";
import type { BlobStore, ChunkRef } from "./stores/types";

export interface IndexRow {
  id: string; title: string; kind: string; version: number;
  manifest_object: string | null; updated_at: string; deleted_at: string | null;
}
export interface ObjectRow {
  id: string; sha256: string; bytes: number; provider: BlobStore["provider"]; wrapped_key: Uint8Array; chunks: ChunkRef[];
}
export interface SyncIndex {
  listChanged(sinceIso: string | null): Promise<IndexRow[]>;
  getRow(id: string): Promise<IndexRow | null>;
  /** false when the row already exists (another device created it first) */
  insertRow(row: Omit<IndexRow, "updated_at">): Promise<boolean>;
  /** false when `version` is no longer `baseVersion` (someone else pushed) */
  casUpdate(id: string, baseVersion: number, patch: Partial<Omit<IndexRow, "id" | "updated_at">>): Promise<boolean>;
  getObject(id: string): Promise<ObjectRow | null>;
  insertObject(o: Omit<ObjectRow, "id">): Promise<ObjectRow>;
  deleteObject(id: string): Promise<void>;
  /** bytes this user keeps in Supabase Storage (for the quota tier) */
  supabaseBytesUsed(): Promise<number>;
}
export interface SyncEnv { index: SyncIndex; stores: BlobStore[]; master: CryptoKey }

type NbMeta = { version: number; stamp: number };
const nbKey = (id: string) => `nb:${id}`;
const getMeta = async (id: string) => ((await db.syncMeta.get(nbKey(id)))?.value as NbMeta | undefined) ?? null;
const setMeta = (id: string, m: NbMeta) => db.syncMeta.put({ key: nbKey(id), value: m });

/** Changes to a notebook, its cards, recordings or Trash state all move this number. */
export async function localStamp(id: string): Promise<number> {
  const nb = await db.notebooks.get(id);
  if (!nb) return 0;
  let t = Math.max(nb.updatedAt, nb.trashedAt ?? 0);
  await db.cards.where("notebookId").equals(id).each((c) => { t = Math.max(t, c.updatedAt ?? 0); });
  await db.recordings.where("notebookId").equals(id).each((r) => { t = Math.max(t, r.updatedAt ?? 0); });
  return t;
}

async function dropObject(env: SyncEnv, obj: ObjectRow | null): Promise<void> {
  if (!obj) return;
  const store = env.stores.find((s) => s.provider === obj.provider);
  await store?.remove(obj.chunks).catch(() => undefined);
  await env.index.deleteObject(obj.id).catch(() => undefined);
}

async function fetchSnapshot(env: SyncEnv, row: IndexRow): Promise<Blob> {
  const obj = row.manifest_object ? await env.index.getObject(row.manifest_object) : null;
  if (!obj) throw new Error(`"${row.title}" has no stored copy yet.`);
  const store = env.stores.find((s) => s.provider === obj.provider);
  if (!store) throw new Error(`"${row.title}" is stored in ${obj.provider}. Connect it in Account → Storage to download it.`);
  const chunks = await store.get(obj.chunks);
  const zip = await decryptBlob({ wrappedKey: obj.wrapped_key, chunks }, env.master);
  return new Blob([zip as BlobPart], { type: "application/zip" });
}

export type PushResult = "pushed" | "clean" | "conflict" | "missing";

export async function pushNotebook(env: SyncEnv, id: string): Promise<PushResult> {
  const nb = await db.notebooks.get(id);
  if (!nb) return "missing";
  const stamp = await localStamp(id);
  const meta = await getMeta(id);
  if (meta && meta.stamp >= stamp) return "clean";
  const row = await env.index.getRow(id);
  if (row && row.version !== meta?.version) return "conflict";

  const zip = new Uint8Array(await (await exportBackup(id)).arrayBuffer());
  const sealed = await encryptBlob(zip, env.master);
  const { provider, refs } = await putTiered(newId(), sealed.chunks, { stores: env.stores, usedBytes: await env.index.supabaseBytesUsed() });
  const obj = await env.index.insertObject({
    sha256: await sha256Hex(zip), bytes: zip.byteLength, provider, wrapped_key: sealed.wrappedKey, chunks: refs,
  });
  const fields = {
    title: nb.title, kind: nb.kind ?? "notebook", manifest_object: obj.id,
    deleted_at: nb.trashedAt ? new Date(nb.trashedAt).toISOString() : null,
  };
  const ok = row
    ? await env.index.casUpdate(id, row.version, { ...fields, version: row.version + 1 })
    : await env.index.insertRow({ id, ...fields, version: 1 });
  if (!ok) { await dropObject(env, obj); return "conflict"; }
  if (row?.manifest_object && row.manifest_object !== obj.id) await dropObject(env, await env.index.getObject(row.manifest_object));
  await setMeta(id, { version: row ? row.version + 1 : 1, stamp });
  return "pushed";
}

export async function pullAll(env: SyncEnv): Promise<{ pulled: number; conflicts: number; trashed: number; errors: string[] }> {
  const since = ((await db.syncMeta.get("lastPulledAt"))?.value as string | undefined) ?? null;
  const rows = (await env.index.listChanged(since)).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const out = { pulled: 0, conflicts: 0, trashed: 0, errors: [] as string[] };
  let newest = since;
  for (const row of rows) {
    if (!newest || row.updated_at > newest) newest = row.updated_at;
    try {
      const meta = await getMeta(row.id);
      if (meta && row.version <= meta.version) continue;
      const local = await db.notebooks.get(row.id);
      const dirty = !!local && (!meta || (await localStamp(row.id)) > meta.stamp);

      if (row.deleted_at && !dirty) {
        if (local && !local.trashedAt) await trashNotebook(row.id, Date.parse(row.deleted_at));
        await setMeta(row.id, { version: row.version, stamp: await localStamp(row.id) });
        if (local) out.trashed++;
        continue;
      }
      const snapshot = await fetchSnapshot(env, row);
      if (dirty) {
        // both sides changed: keep theirs as a copy, keep ours as the notebook (pushed next)
        const copy = await importBackup(snapshot);
        await renameNotebook(copy.id, `${copy.title} (conflict copy)`);
        await setMeta(row.id, { version: row.version, stamp: meta?.stamp ?? 0 });
        out.conflicts++;
        continue;
      }
      if (local) await deleteNotebook(row.id);
      await importBackup(snapshot, { keepIds: true });
      await setMeta(row.id, { version: row.version, stamp: await localStamp(row.id) });
      out.pulled++;
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (newest && out.errors.length === 0) await db.syncMeta.put({ key: "lastPulledAt", value: newest });
  return out;
}

export async function syncAll(env: SyncEnv): Promise<{ pulled: number; pushed: number; conflicts: number; errors: string[] }> {
  const pulled = await pullAll(env);
  let pushed = 0;
  let conflicts = pulled.conflicts;
  const errors = [...pulled.errors];
  for (const id of (await db.notebooks.toCollection().primaryKeys()) as string[]) {
    try {
      const r = await pushNotebook(env, id);
      if (r === "pushed") pushed++;
      if (r === "conflict") conflicts++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { pulled: pulled.pulled, pushed, conflicts, errors };
}

/** In-memory index: tests, and a way to try the engine without a server. */
export function memoryIndex(): SyncIndex {
  const rows = new Map<string, IndexRow>();
  const objects = new Map<string, ObjectRow>();
  let tick = 0;
  const stamp = () => new Date(Date.now() + tick++).toISOString();
  return {
    async listChanged(since) { return [...rows.values()].filter((r) => !since || r.updated_at >= since).map((r) => ({ ...r })); },
    async getRow(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async insertRow(row) { if (rows.has(row.id)) return false; rows.set(row.id, { ...row, updated_at: stamp() }); return true; },
    async casUpdate(id, base, patch) {
      const r = rows.get(id);
      if (!r || r.version !== base) return false;
      rows.set(id, { ...r, ...patch, updated_at: stamp() });
      return true;
    },
    async getObject(id) { return objects.get(id) ?? null; },
    async insertObject(o) { const row = { ...o, id: newId() }; objects.set(row.id, row); return row; },
    async deleteObject(id) { objects.delete(id); },
    async supabaseBytesUsed() { return 0; },
  };
}
