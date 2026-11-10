import type { SupabaseClient } from "@supabase/supabase-js";
import { QuotaError } from "./router";
import type { BlobStore } from "./types";

const BUCKET = "blobs";

/** Private bucket, one folder per user (policy: first path segment = auth.uid()). */
export function createSupabaseStore(client: SupabaseClient, userId: string): BlobStore {
  const bucket = () => client.storage.from(BUCKET);
  return {
    provider: "supabase",
    async put(objectId, chunks) {
      const refs = [];
      for (let i = 0; i < chunks.length; i++) {
        const path = `${userId}/${objectId}.${i}`;
        const { error } = await bucket().upload(path, new Blob([chunks[i] as BlobPart], { type: "application/octet-stream" }), { upsert: false });
        if (error) {
          // the insert policy refuses uploads past the per-user cap ("row-level security"), or the file is too big
          if (/row-level security|quota|exceeded|too large|payload/i.test(error.message)) throw new QuotaError();
          throw new Error(`Cloud upload failed: ${error.message}`);
        }
        refs.push({ ref: path, size: chunks[i].byteLength });
      }
      return refs;
    },
    async get(refs) {
      const out: Uint8Array[] = [];
      for (const r of refs) {
        const { data, error } = await bucket().download(r.ref);
        if (error || !data) throw new Error(`Cloud download failed: ${error?.message ?? "missing file"}`);
        out.push(new Uint8Array(await data.arrayBuffer()));
      }
      return out;
    },
    async remove(refs) {
      if (refs.length) await bucket().remove(refs.map((r) => r.ref));
    },
  };
}

/** Bytes this user keeps in the bucket (for the tier decision). */
export async function supabaseBytesUsed(client: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await client.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error || !data) return 0;
  return data.reduce((s, f) => s + (Number((f.metadata as { size?: number } | null)?.size) || 0), 0);
}
