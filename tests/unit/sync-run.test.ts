// @vitest-environment node
import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import { unlockWithProfile } from "../../src/sync/run";

function fakeProfiles(initial: { kdf_salt: string | null; key_check: string | null }) {
  const row = { ...initial };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }) }),
      update: (patch: typeof row) => ({ eq: async () => { Object.assign(row, patch); return { error: null }; } }),
    }),
  };
  return { client: client as never, row };
}

beforeEach(async () => { await db.syncMeta.clear(); });

it("first unlock creates the salt and key check; later unlocks verify the passphrase", async () => {
  const p = fakeProfiles({ kdf_salt: null, key_check: null });
  await unlockWithProfile("my sync words", p.client, "u1", 1000);
  expect(p.row.kdf_salt).toMatch(/^\\x[0-9a-f]{32}$/);
  expect(p.row.key_check).toMatch(/^\\x[0-9a-f]+$/);

  await expect(unlockWithProfile("my sync words", p.client, "u1", 1000)).resolves.toBeUndefined();
  await expect(unlockWithProfile("wrong words", p.client, "u1", 1000)).rejects.toThrow(/wrong sync passphrase/i);
});

it("never stores the passphrase, only a non-extractable key", async () => {
  const p = fakeProfiles({ kdf_salt: null, key_check: null });
  await unlockWithProfile("secret phrase", p.client, "u1", 1000);
  const rows = await db.syncMeta.toArray();
  expect(JSON.stringify(rows)).not.toContain("secret phrase");
  const key = rows.find((r) => r.key === "dev:master")?.value as CryptoKey;
  expect(key.extractable).toBe(false);
});
