// @vitest-environment node
import {
  checkPassphrase, decryptBlob, deriveMasterKey, encryptBlob, makeKeyCheck, newSalt, sha256Hex,
} from "../../src/sync/crypto";

const ITER = 1000; // fast in tests; the app uses 600k
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

it("round-trips bytes through encrypt/decrypt with the same passphrase", async () => {
  const salt = newSalt();
  const key = await deriveMasterKey("correct horse", salt, ITER);
  const data = bytes(5000);
  const sealed = await encryptBlob(data, key);
  expect(sealed.chunks.length).toBe(1);
  // ciphertext never contains the plaintext
  expect(Buffer.from(sealed.chunks[0]).includes(Buffer.from(data.slice(0, 64)))).toBe(false);
  const back = await decryptBlob(sealed, await deriveMasterKey("correct horse", salt, ITER));
  expect(Array.from(back)).toEqual(Array.from(data));
});

it("splits big blobs into chunks no larger than the chunk size and reassembles them in order", async () => {
  const key = await deriveMasterKey("pw", newSalt(), ITER);
  const data = bytes(2500, 7);
  const sealed = await encryptBlob(data, key, 1000);
  expect(sealed.chunks.length).toBe(3);
  for (const c of sealed.chunks) expect(c.byteLength).toBeLessThanOrEqual(1000 + 12 + 16);
  expect(Array.from(await decryptBlob(sealed, key))).toEqual(Array.from(data));
});

it("fails on a wrong passphrase, tampering, or reordered chunks", async () => {
  const salt = newSalt();
  const key = await deriveMasterKey("right", salt, ITER);
  const sealed = await encryptBlob(bytes(2500), key, 1000);
  await expect(decryptBlob(sealed, await deriveMasterKey("wrong", salt, ITER))).rejects.toThrow();
  const tampered = { ...sealed, chunks: sealed.chunks.map((c, i) => (i === 1 ? Uint8Array.from(c, (b, j) => (j === 20 ? b ^ 1 : b)) : c)) };
  await expect(decryptBlob(tampered, key)).rejects.toThrow();
  const swapped = { ...sealed, chunks: [sealed.chunks[1], sealed.chunks[0], sealed.chunks[2]] };
  await expect(decryptBlob(swapped, key)).rejects.toThrow();
});

it("each blob gets its own data key (same input, different ciphertext)", async () => {
  const key = await deriveMasterKey("pw", newSalt(), ITER);
  const a = await encryptBlob(bytes(100), key);
  const b = await encryptBlob(bytes(100), key);
  expect(Buffer.from(a.wrappedKey).equals(Buffer.from(b.wrappedKey))).toBe(false);
  expect(Buffer.from(a.chunks[0]).equals(Buffer.from(b.chunks[0]))).toBe(false);
});

it("a key check tells a right passphrase from a wrong one", async () => {
  const salt = newSalt();
  const check = await makeKeyCheck(await deriveMasterKey("mine", salt, ITER));
  expect(await checkPassphrase(await deriveMasterKey("mine", salt, ITER), check)).toBe(true);
  expect(await checkPassphrase(await deriveMasterKey("nope", salt, ITER), check)).toBe(false);
});

it("hashes content for dedup", async () => {
  expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
