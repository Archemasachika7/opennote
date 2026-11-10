/**
 * End-to-end encryption for sync (storage design §4). Everything runs on the device with WebCrypto.
 *
 * passphrase ──PBKDF2-SHA256(600k, salt)──▶ master key (AES-GCM-256, never stored, never sent)
 * per blob: random data key (AES-GCM-256) ──wrapped by master──▶ wrappedKey (stored in the index row)
 * per chunk: iv(12) ‖ AES-GCM(data key, chunk, aad = "opennote:<index>/<count>")
 */

export const PBKDF2_ITERATIONS = 600_000;
/** Telegram bots can download at most 20 MB per file: stay safely under it. */
export const CHUNK_BYTES = 19 * 1024 * 1024;
const IV = 12;
const CHECK = new TextEncoder().encode("opennote-key-check-v1");

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This browser can't encrypt (WebCrypto missing). Use a current Chrome, Edge or Firefox.");
  return s;
};
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const concat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const aad = (i: number, n: number) => new TextEncoder().encode(`opennote:${i}/${n}`);

export interface SealedBlob {
  /** iv ‖ data key encrypted with the master key */
  wrappedKey: Uint8Array;
  /** each: iv ‖ ciphertext, in order */
  chunks: Uint8Array[];
}

export const newSalt = (): Uint8Array => rand(16);

export async function deriveMasterKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  if (!passphrase) throw new Error("Enter your sync passphrase.");
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: buf(salt), iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

export async function encryptBlob(data: Uint8Array, master: CryptoKey, chunkBytes = CHUNK_BYTES): Promise<SealedBlob> {
  const dataKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const kIv = rand(IV);
  const wrapped = new Uint8Array(await subtle().wrapKey("raw", dataKey, master, { name: "AES-GCM", iv: buf(kIv) }));
  const n = Math.max(1, Math.ceil(data.byteLength / chunkBytes));
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const iv = rand(IV);
    const part = data.subarray(i * chunkBytes, Math.min(data.byteLength, (i + 1) * chunkBytes));
    const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad(i, n)) }, dataKey, buf(part)));
    chunks.push(concat(iv, ct));
  }
  return { wrappedKey: concat(kIv, wrapped), chunks };
}

export async function decryptBlob(sealed: SealedBlob, master: CryptoKey): Promise<Uint8Array> {
  const kIv = sealed.wrappedKey.subarray(0, IV);
  const dataKey = await subtle().unwrapKey("raw", buf(sealed.wrappedKey.subarray(IV)), master,
    { name: "AES-GCM", iv: buf(kIv) }, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const n = sealed.chunks.length;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const c = sealed.chunks[i];
    parts.push(new Uint8Array(await subtle().decrypt(
      { name: "AES-GCM", iv: buf(c.subarray(0, IV)), additionalData: buf(aad(i, n)) }, dataKey, buf(c.subarray(IV)))));
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/** Stored in profiles.key_check, so a new device can tell a wrong passphrase from damaged data. */
export async function makeKeyCheck(master: CryptoKey): Promise<Uint8Array> {
  const iv = rand(IV);
  return concat(iv, new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, master, buf(CHECK))));
}

export async function checkPassphrase(master: CryptoKey, check: Uint8Array): Promise<boolean> {
  try {
    const plain = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(check.subarray(0, IV)) }, master, buf(check.subarray(IV))));
    return plain.length === CHECK.length && plain.every((b, i) => b === CHECK[i]);
  } catch {
    return false;
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await subtle().digest("SHA-256", buf(data)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
