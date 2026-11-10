import type { BlobStore, ChunkRef } from "./types";

/** Per-user share of the free Supabase Storage (1 GB for everyone). The server enforces the same cap. */
export const SUPABASE_QUOTA_BYTES = 50 * 1024 * 1024;

export class QuotaError extends Error {
  constructor() { super("Supabase storage quota reached."); this.name = "QuotaError"; }
}
export class StorageFullError extends Error {
  constructor() {
    super("Cloud storage is full. Connect your Telegram bot in Settings → Storage to keep syncing (your notes stay safe on this device).");
    this.name = "StorageFullError";
  }
}

/**
 * Tiered put: Supabase Storage while this user is under the quota, then their Telegram bot.
 * `usedBytes` is what this user already keeps in Supabase Storage.
 */
export async function putTiered(
  objectId: string,
  chunks: Uint8Array[],
  opts: { primary: BlobStore | null; fallback: BlobStore | null; usedBytes: number; quotaBytes?: number },
): Promise<{ provider: BlobStore["provider"]; refs: ChunkRef[] }> {
  const size = chunks.reduce((s, c) => s + c.byteLength, 0);
  const quota = opts.quotaBytes ?? SUPABASE_QUOTA_BYTES;
  if (opts.primary && opts.usedBytes + size <= quota) {
    try {
      return { provider: opts.primary.provider, refs: await opts.primary.put(objectId, chunks) };
    } catch (err) {
      if (!(err instanceof QuotaError)) throw err;
    }
  }
  if (!opts.fallback) throw new StorageFullError();
  return { provider: opts.fallback.provider, refs: await opts.fallback.put(objectId, chunks) };
}
