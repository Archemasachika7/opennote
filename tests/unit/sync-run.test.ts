// @vitest-environment node
import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import {
  forgetOtherAccount, loadSharedSettings, reactToAuth, unlockWithProfile, updateSharedSettings, withSettingsLock,
} from "../../src/sync/run";
import { deriveMasterKey, newSalt, openJson, sealJson } from "../../src/sync/crypto";
import { toPgBytea } from "../../src/sync/supabaseIndex";

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

/* ---- storage keys shared across devices (encrypted in profiles.storage_settings) ---- */

/** One account row shared by every "device" in a test. `failNext` makes the next update fail like a network error. */
function fakeAccount() {
  const row: { storage_settings: string | null } = { storage_settings: null };
  const state = { failNext: false };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }) }),
      update: (patch: typeof row) => ({
        eq: async () => {
          if (state.failNext) { state.failNext = false; return { error: { message: "offline" } }; }
          Object.assign(row, patch);
          return { error: null };
        },
      }),
    }),
  };
  return { client: client as never, row, state };
}
const key = () => deriveMasterKey("pass words", newSalt(), 1000);
const TG = { token: "123:abc", username: "my_bot", chatId: "42" };
const PIN = { jwt: "a.b.c" };
const local = async (k: "telegram" | "pinata") => (await db.syncMeta.get(`dev:${k}`))?.value;
/** Simulate switching to another device: wipe this device's settings. */
const otherDevice = () => db.syncMeta.clear();

it("sealJson/openJson round-trip, and a different key can't open it", async () => {
  const k = await key();
  const sealed = await sealJson({ hi: 1 }, k);
  expect(await openJson(sealed, k)).toEqual({ hi: 1 });
  await expect(openJson(sealed, await key())).rejects.toThrow();
});

it("saving puts the keys in the account encrypted, never as plain text", async () => {
  const k = await key();
  const a = fakeAccount();
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: TG, pinata: PIN }));
  expect(a.row.storage_settings).toMatch(/^\\x[0-9a-f]+$/);
  expect(a.row.storage_settings).not.toContain(Buffer.from("123:abc").toString("hex"));
  expect(await local("telegram")).toEqual(TG);
});

it("a second device gets the keys after unlocking, without typing them", async () => {
  const k = await key();
  const a = fakeAccount();
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: TG, pinata: PIN }));

  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("telegram")).toEqual(TG);
  expect(await local("pinata")).toEqual(PIN);
});

it("disconnecting on one device removes the key on the others, even a stale one that changes something else", async () => {
  const k = await key();
  const a = fakeAccount();
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: TG, pinata: PIN }));

  // device B holds an old copy; device A disconnects Telegram
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: null }));
  await db.syncMeta.bulkPut([{ key: "dev:telegram", value: TG }, { key: "dev:pinata", value: PIN }]);

  // B changes Pinata without having pulled first: Telegram must not come back
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, pinata: { jwt: "x.y.z" } }));
  expect(await local("telegram")).toBeUndefined();
  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("telegram")).toBeUndefined();
  expect(await local("pinata")).toEqual({ jwt: "x.y.z" });
});

it("a failed upload changes nothing, so the next pull can't undo it silently", async () => {
  const k = await key();
  const a = fakeAccount();
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: TG }));

  a.state.failNext = true;
  await expect(updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: null })))
    .rejects.toThrow(/couldn't save/i);
  expect(await local("telegram")).toEqual(TG); // still connected, and the user saw the error
});

it("keys saved on a device before this feature are uploaded the first time", async () => {
  const k = await key();
  const a = fakeAccount();
  await db.syncMeta.put({ key: "dev:telegram", value: TG });
  await loadSharedSettings(a.client, "u1", k); // account has nothing yet
  expect(a.row.storage_settings).not.toBeNull();
  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("telegram")).toEqual(TG);
});

it("first upload from two devices merges them: one's Telegram and the other's Pinata both survive", async () => {
  const k = await key();
  const a = fakeAccount();
  await db.syncMeta.put({ key: "dev:telegram", value: TG }); // device A
  await loadSharedSettings(a.client, "u1", k);

  await otherDevice();
  await db.syncMeta.put({ key: "dev:pinata", value: PIN }); // device B
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("telegram")).toEqual(TG);
  expect(await local("pinata")).toEqual(PIN);

  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("pinata")).toEqual(PIN); // A now gets B's Pinata too
});

it("a damaged account copy gives a clear error and leaves this device alone", async () => {
  const k = await key();
  const a = fakeAccount();
  a.row.storage_settings = toPgBytea(await sealJson({ telegram: TG }, await key())); // sealed with another key
  await db.syncMeta.put({ key: "dev:pinata", value: PIN });
  await expect(loadSharedSettings(a.client, "u1", k)).rejects.toThrow(/couldn't be read/i);
  expect(await local("pinata")).toEqual(PIN);
});

it("another account signing in on this device never gets the first account's keys", async () => {
  await db.syncMeta.bulkPut([
    { key: "dev:owner", value: "alice" }, { key: "dev:master", value: "k" },
    { key: "dev:telegram", value: TG }, { key: "dev:pinata", value: PIN },
  ]);
  await forgetOtherAccount("alice");
  expect(await local("telegram")).toEqual(TG); // same account: kept

  await forgetOtherAccount("bob");
  expect(await local("telegram")).toBeUndefined();
  expect(await local("pinata")).toBeUndefined();
  expect(await db.syncMeta.get("dev:master")).toBeUndefined();

  // so Bob's first upload has nothing of Alice's
  const k = await key();
  const a = fakeAccount();
  await loadSharedSettings(a.client, "bob", k);
  expect(a.row.storage_settings).toBeNull();
});

it("unlocking as a different account clears the previous account's keys and claims the device", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:owner", value: "alice" }, { key: "dev:telegram", value: TG }]);
  const p = fakeProfiles({ kdf_salt: null, key_check: null });
  await unlockWithProfile("bob words", p.client, "bob", 1000);
  expect(await local("telegram")).toBeUndefined();
  expect((await db.syncMeta.get("dev:owner"))?.value).toBe("bob");
});

it("signing out forgets this device's keys", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:owner", value: "alice" }, { key: "dev:telegram", value: TG }]);
  await forgetOtherAccount(null);
  expect(await local("telegram")).toBeUndefined();
});

it("settings changes run one at a time, in order", async () => {
  const order: string[] = [];
  const slow = withSettingsLock(async () => { await new Promise((r) => setTimeout(r, 20)); order.push("connect"); });
  const pull = withSettingsLock(async () => { order.push("pull"); });
  const failing = withSettingsLock(async () => { throw new Error("boom"); });
  const after = withSettingsLock(async () => { order.push("after"); });
  await Promise.all([slow, pull, failing.catch(() => undefined), after]);
  expect(order).toEqual(["connect", "pull", "after"]);
  await expect(failing).rejects.toThrow("boom");
});

/* ---- reload keeps sync unlocked ---- */

it("the signed-out moment before a saved login loads doesn't lock sync or forget keys", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:owner", value: "alice" }, { key: "dev:master", value: "k" }, { key: "dev:telegram", value: TG }]);
  await reactToAuth(null, null); // app start: no user yet
  await reactToAuth(null, "alice"); // saved login restored
  expect(await db.syncMeta.get("dev:master")).toBeDefined();
  expect(await local("telegram")).toEqual(TG);
});

it("a real sign-out still locks sync and forgets keys", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:owner", value: "alice" }, { key: "dev:master", value: "k" }, { key: "dev:telegram", value: TG }]);
  await reactToAuth("alice", null);
  expect(await db.syncMeta.get("dev:master")).toBeUndefined();
  expect(await local("telegram")).toBeUndefined();
});

it("restoring a login for a different account than the one that unlocked locks sync", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:owner", value: "alice" }, { key: "dev:master", value: "k" }]);
  await reactToAuth(null, "bob");
  expect(await db.syncMeta.get("dev:master")).toBeUndefined();
});
