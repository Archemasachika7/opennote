/**
 * Deleting with sync. Three ways to delete a notebook, and each one has to mean the same thing on
 * every device:
 *
 * - Trash (trashNotebook): everywhere, restorable for 30 days. Already synced as `deleted_at`.
 * - Delete everywhere: gone from this device now; the next sync turns the index row into a purge
 *   marker (deleted_at set, no stored copy) and every other device deletes its copy on pull.
 * - Remove from this device: gone here only. The account and other devices keep it; this device
 *   remembers not to download it again until you ask for it back (Sync panel → Download again).
 *
 * The intent is a tombstone in syncMeta, so it survives being offline and app restarts.
 */
import { db, now } from "../store/schema";
import { deleteNotebook } from "../store/notebooks";

export type DeleteScope = "everywhere" | "device";
export type Tombstone = { id: string; scope: DeleteScope; at: number; title: string };

const TOMB = "tomb:";
const REFETCH = "refetch:";

export async function getTombstone(id: string): Promise<Tombstone | null> {
  const v = (await db.syncMeta.get(TOMB + id))?.value as Omit<Tombstone, "id"> | undefined;
  return v ? { id, ...v } : null;
}

export async function listTombstones(scope?: DeleteScope): Promise<Tombstone[]> {
  const rows = await db.syncMeta.where("key").startsWith(TOMB).toArray();
  return rows
    .map((r) => ({ id: r.key.slice(TOMB.length), ...(r.value as Omit<Tombstone, "id">) }))
    .filter((t) => !scope || t.scope === scope);
}

export const clearTombstone = (id: string): Promise<void> => db.syncMeta.delete(TOMB + id);

/** True once this device has synced the notebook at least once (so a copy exists in the account). */
export async function isSynced(id: string): Promise<boolean> {
  return !!(await db.syncMeta.get(`nb:${id}`));
}

/** Delete a notebook here and, on the next sync, on every device and in the account. Cannot be undone. */
export async function deleteEverywhere(id: string): Promise<void> {
  const nb = await db.notebooks.get(id);
  // never synced: there is nothing to delete elsewhere, so no tombstone is needed
  if (await isSynced(id)) {
    await db.syncMeta.put({ key: TOMB + id, value: { scope: "everywhere", at: now(), title: nb?.title ?? "Notebook" } });
  }
  await deleteNotebook(id);
}

/** Delete only this device's copy. The account and other devices keep it. */
export async function removeFromDevice(id: string): Promise<void> {
  const nb = await db.notebooks.get(id);
  if (await isSynced(id)) {
    await db.syncMeta.put({ key: TOMB + id, value: { scope: "device", at: now(), title: nb?.title ?? "Notebook" } });
  }
  await deleteNotebook(id);
}

/** Bring a notebook removed from this device back: the next sync downloads it again. */
export async function restoreToDevice(id: string): Promise<void> {
  await db.transaction("rw", db.syncMeta, async () => {
    await db.syncMeta.delete(TOMB + id);
    await db.syncMeta.delete(`nb:${id}`);
    await db.syncMeta.put({ key: REFETCH + id, value: now() });
  });
}

/** Notebooks to download on the next pull even if their index row hasn't changed since the last one. */
export async function takeRefetchIds(): Promise<string[]> {
  return ((await db.syncMeta.where("key").startsWith(REFETCH).primaryKeys()) as string[]).map((k) => k.slice(REFETCH.length));
}
export const doneRefetch = (id: string): Promise<void> => db.syncMeta.delete(REFETCH + id);
