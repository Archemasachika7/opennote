import type { SupabaseClient } from "@supabase/supabase-js";
import type { IndexRow, ObjectRow, SyncIndex } from "./engine";
import { supabaseBytesUsed } from "./stores/supabaseStorage";

/** PostgREST sends bytea as "\x0a1b..." text. */
export const toPgBytea = (u: Uint8Array): string => "\\x" + Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
export function fromPgBytea(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  const s = typeof v === "string" ? v.replace(/^\\x/, "") : "";
  if (s.length % 2) throw new Error("Damaged key data in the index.");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const ROW = "id,title,kind,version,manifest_object,updated_at,deleted_at";
const OBJ = "id,sha256,bytes,provider,wrapped_key,chunks";
const toObject = (r: Record<string, unknown>): ObjectRow => ({
  id: String(r.id), sha256: String(r.sha256), bytes: Number(r.bytes), provider: r.provider as ObjectRow["provider"],
  wrapped_key: fromPgBytea(r.wrapped_key), chunks: Array.isArray(r.chunks) ? (r.chunks as ObjectRow["chunks"]) : [],
});
const fail = (what: string, e: { message: string }) => new Error(`Sync ${what} failed: ${e.message}`);

/** The index in Supabase (RLS: each user sees only their own rows; owner_id defaults to auth.uid()). */
export function supabaseIndex(client: SupabaseClient, userId: string): SyncIndex {
  return {
    async listChanged(since) {
      let q = client.from("notebooks_idx").select(ROW).order("updated_at").limit(1000);
      if (since) q = q.gte("updated_at", since);
      const { data, error } = await q;
      if (error) throw fail("list", error);
      return (data ?? []) as IndexRow[];
    },
    async getRow(id) {
      const { data, error } = await client.from("notebooks_idx").select(ROW).eq("id", id).maybeSingle();
      if (error) throw fail("read", error);
      return (data as IndexRow | null) ?? null;
    },
    async insertRow(row) {
      const { error } = await client.from("notebooks_idx").insert(row);
      if (error?.code === "23505") return false; // another device created it first
      if (error) throw fail("create", error);
      return true;
    },
    async casUpdate(id, base, patch) {
      const { data, error } = await client.from("notebooks_idx").update(patch).eq("id", id).eq("version", base).select("id");
      if (error) throw fail("update", error);
      return (data ?? []).length === 1;
    },
    async getObject(id) {
      const { data, error } = await client.from("objects").select(OBJ).eq("id", id).maybeSingle();
      if (error) throw fail("read", error);
      return data ? toObject(data as Record<string, unknown>) : null;
    },
    async insertObject(o) {
      const { data, error } = await client.from("objects")
        .insert({ ...o, wrapped_key: toPgBytea(o.wrapped_key) }).select(OBJ).single();
      if (error) throw fail("store", error);
      return toObject(data as Record<string, unknown>);
    },
    async deleteObject(id) {
      const { error } = await client.from("objects").delete().eq("id", id);
      if (error) throw fail("delete", error);
    },
    supabaseBytesUsed: () => supabaseBytesUsed(client, userId),
  };
}
