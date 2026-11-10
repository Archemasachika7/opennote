import type { BlobStore, ChunkRef } from "./types";

/** Per-user share of the free Supabase Storage (1 GB for everyone). The server enforces the same cap. */
export const SUPABASE_QUOTA_BYTES = 50 * 1024 * 1024;

export class QuotaError extends Error {
  constructor() { super("Supabase storage quota reached."); this.name = "QuotaError"; }
}
export class StorageFullError extends Error {
  constructor(public readonly causes: string[] = []) {
    super("Cloud storage is full or unreachable. Connect your Telegram bot (or a Pinata key) in Account → Storage to keep syncing. Your notes stay safe on this device.");
    this.name = "StorageFullError";
  }
}

/**
 * Tiered put, in order (usually Supabase → Telegram → Pinata/IPFS). Supabase is skipped once this upload would
 * cross the per-user quota; any store that fails hands over to the next one.
 */
export async function putTiered(
  objectId: string,
  chunks: Uint8Array[],
  opts: { stores: BlobStore[]; usedBytes: number; quotaBytes?: number },
): Promise<{ provider: BlobStore["provider"]; refs: ChunkRef[] }> {
  const size = chunks.reduce((s, c) => s + c.byteLength, 0);
  const quota = opts.quotaBytes ?? SUPABASE_QUOTA_BYTES;
  const causes: string[] = [];
  for (const store of opts.stores) {
    if (store.provider === "supabase" && opts.usedBytes + size > quota) { causes.push("supabase: over quota"); continue; }
    try {
      return { provider: store.provider, refs: await store.put(objectId, chunks) };
    } catch (err) {
      causes.push(`${store.provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new StorageFullError(causes);
}
