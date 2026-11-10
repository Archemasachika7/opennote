import type { BlobStore, ChunkRef } from "./types";

/**
 * IPFS via Pinata (free 1 GB, the user's own JWT, kept on this device). Chunks are already encrypted
 * (../crypto.ts), so pinning them on the public IPFS network exposes only ciphertext. Pinata's upload,
 * API and gateway all answer browsers with CORS `*` (checked 2026-11-10).
 */
const UPLOAD = "https://uploads.pinata.cloud/v3/files";
const API = "https://api.pinata.cloud/v3/files/public";
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud";

export interface PinataConfig { jwt: string; gateway?: string; fetch?: typeof fetch }

export function createPinataStore(cfg: PinataConfig): BlobStore {
  const f = cfg.fetch ?? fetch;
  const auth = { Authorization: `Bearer ${cfg.jwt.trim()}` };
  const gateway = (cfg.gateway?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, "");
  return {
    provider: "pinata",
    async put(objectId, chunks) {
      const refs: ChunkRef[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const fd = new FormData();
        fd.append("network", "public");
        fd.append("name", `${objectId}.${i}.bin`);
        fd.append("file", new Blob([chunks[i] as BlobPart], { type: "application/octet-stream" }), `${objectId}.${i}.bin`);
        const res = await f(UPLOAD, { method: "POST", headers: auth, body: fd });
        if (res.status === 401 || res.status === 403) throw new Error("Pinata rejected the key. Create a new JWT at app.pinata.cloud.");
        const body = (await res.json().catch(() => ({}))) as { data?: { id?: string; cid?: string } };
        if (!res.ok || !body.data?.cid || !body.data.id) throw new Error(`Pinata upload failed (${res.status}).`);
        refs.push({ ref: `${body.data.cid}|${body.data.id}`, size: chunks[i].byteLength });
      }
      return refs;
    },
    async get(refs) {
      const out: Uint8Array[] = [];
      for (const r of refs) {
        const cid = r.ref.split("|")[0];
        const res = await f(`${gateway}/ipfs/${cid}`);
        if (!res.ok) throw new Error(`IPFS download failed (${res.status}).`);
        out.push(new Uint8Array(await res.arrayBuffer()));
      }
      return out;
    },
    async remove(refs) {
      for (const r of refs) {
        const id = r.ref.split("|")[1];
        // unpinning is best effort: what's left is ciphertext
        if (id) await f(`${API}/${id}`, { method: "DELETE", headers: auth }).catch(() => undefined);
      }
    },
  };
}
