// @vitest-environment node
import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import {
  forgetOtherAccount, loadSharedSettings, reactToAuth, saveAiKey, unlockWithProfile, updateSharedSettings, withSettingsLock,
} from "../../src/sync/run";
import { deriveMasterKey, newSalt, openJson, sealJson } from "../../src/sync/crypto";
import { fromPgBytea, toPgBytea } from "../../src/sync/supabaseIndex";
import { getGeminiKey, setGeminiKey } from "../../src/ai/gemini";
import { getSarvamApiKey } from "../../src/ai/sarvamStt";

// the AI keys live in localStorage, which node doesn't have
const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  },
});

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

beforeEach(async () => { await db.syncMeta.clear(); mem.clear(); });

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

/**
 * One account row shared by every "device" in a test. Updates honour .eq() filters like PostgREST, so a
 * version check can miss. `failNext` fails the next update like a network error; `beforeUpdate` runs
 * just before an update lands, to play another device writing at the same moment.
 */
function fakeAccount() {
  const row: { storage_settings: string | null; storage_settings_version: number } = { storage_settings: null, storage_settings_version: 0 };
  const state: { failNext: boolean; beforeUpdate: null | (() => void) } = { failNext: false, beforeUpdate: null };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }) }),
      update: (patch: Partial<typeof row>) => {
        const filters: [string, unknown][] = [];
        const b = {
          eq: (col: string, val: unknown) => { filters.push([col, val]); return b; },
          select: async () => {
            if (state.failNext) { state.failNext = false; return { data: null, error: { message: "offline" } }; }
            const hook = state.beforeUpdate; state.beforeUpdate = null; hook?.();
            const r = row as Record<string, unknown>;
            if (!filters.every(([c, v]) => c === "id" || r[c] === v)) return { data: [], error: null };
            Object.assign(row, patch);
            return { data: [{ id: "u1" }], error: null };
          },
        };
        return b;
      },
    }),
  };
  return { client: client as never, row, state };
}
const key = () => deriveMasterKey("pass words", newSalt(), 1000);
const TG = { token: "123:abc", username: "my_bot", chatId: "42" };
const PIN = { jwt: "a.b.c" };
const local = async (k: "telegram" | "pinata") => (await db.syncMeta.get(`dev:${k}`))?.value;
/** Simulate switching to another device: wipe this device's settings. */
const otherDevice = async () => { await db.syncMeta.clear(); mem.clear(); };

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

/* ---- Codex review: ownerless keys, and two devices writing at once ---- */

it("keys left by the previous app version (no owner) are not taken into the account that signs in", async () => {
  await db.syncMeta.bulkPut([{ key: "dev:telegram", value: TG }, { key: "dev:pinata", value: PIN }]); // no dev:owner
  await reactToAuth(null, "bob");
  expect(await local("telegram")).toBeUndefined();
  expect(await local("pinata")).toBeUndefined();
});

/* ---- AI keys (Gemini, Sarvam): entered once, on every device of the account ---- */

it("an AI key entered on one device reaches the others without typing it, encrypted on the way", async () => {
  const k = await key();
  const a = fakeAccount();
  await saveAiKey({ client: a.client, userId: "u1", master: k }, "gemini", "AIza-one");
  await saveAiKey({ client: a.client, userId: "u1", master: k }, "sarvam", "sk-two");
  expect(getGeminiKey()).toBe("AIza-one");
  expect(a.row.storage_settings).not.toContain(Buffer.from("AIza-one").toString("hex"));
  expect(await openJson(fromPgBytea(a.row.storage_settings!), k)).toMatchObject({ gemini: { key: "AIza-one" }, sarvam: { key: "sk-two" } });

  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(getGeminiKey()).toBe("AIza-one");
  expect(getSarvamApiKey()).toBe("sk-two");
});

it("removing an AI key on one device removes it on the others", async () => {
  const k = await key();
  const a = fakeAccount();
  const env = { client: a.client, userId: "u1", master: k };
  await saveAiKey(env, "gemini", "AIza-one");
  await saveAiKey(env, "gemini", "");
  await otherDevice();
  setGeminiKey("AIza-one"); // a device that still has the old key
  localStorage.setItem("opennote.sharedKeys.owner", "u1");
  await loadSharedSettings(a.client, "u1", k);
  expect(getGeminiKey()).toBe("");
});

it("a key changed while sync is locked goes up on the next sync, and the account's older key can't overwrite it", async () => {
  const k = await key();
  const a = fakeAccount();
  await saveAiKey({ client: a.client, userId: "u1", master: k }, "gemini", "AIza-old");
  await saveAiKey(null, "gemini", "AIza-new", "u1"); // signed in, sync not unlocked yet
  expect(getGeminiKey()).toBe("AIza-new");
  await loadSharedSettings(a.client, "u1", k);
  expect(getGeminiKey()).toBe("AIza-new");
  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(getGeminiKey()).toBe("AIza-new");
});

it("a key entered before signing in is taken into the account that unlocks this device", async () => {
  const k = await key();
  const a = fakeAccount();
  setGeminiKey("AIza-mine"); // older app version, or used signed out
  await reactToAuth(null, "u1");
  expect(getGeminiKey()).toBe("AIza-mine"); // never wiped just for signing in
  await loadSharedSettings(a.client, "u1", k);
  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(getGeminiKey()).toBe("AIza-mine");
});

it("another account signing in never gets, or uploads, the first account's AI keys", async () => {
  const k = await key();
  const a = fakeAccount();
  await saveAiKey({ client: a.client, userId: "alice", master: k }, "gemini", "AIza-alice");
  await reactToAuth(null, "alice"); // the same account reopening the app keeps it
  expect(getGeminiKey()).toBe("AIza-alice");

  await reactToAuth(null, "bob");
  expect(getGeminiKey()).toBe("");
  const b = fakeAccount();
  await loadSharedSettings(b.client, "bob", k);
  expect(b.row.storage_settings).toBeNull();
});

it("signing out forgets the account's AI keys on this device", async () => {
  const k = await key();
  const a = fakeAccount();
  await saveAiKey({ client: a.client, userId: "alice", master: k }, "sarvam", "sk-alice");
  await reactToAuth("alice", null);
  expect(getSarvamApiKey()).toBe("");
});

it("two devices changing settings at the same moment both keep their change", async () => {
  const k = await key();
  const a = fakeAccount();
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, telegram: TG, pinata: PIN }));

  // device A disconnects Telegram right as device B (which read the old copy) changes Pinata
  const aWrite = toPgBytea(await sealJson({ telegram: null, pinata: PIN }, k));
  a.state.beforeUpdate = () => { a.row.storage_settings = aWrite; a.row.storage_settings_version += 1; };
  await updateSharedSettings(a.client, "u1", k, (cur) => ({ ...cur, pinata: { jwt: "x.y.z" } }));

  await otherDevice();
  await loadSharedSettings(a.client, "u1", k);
  expect(await local("telegram")).toBeUndefined(); // A's disconnect survived
  expect(await local("pinata")).toEqual({ jwt: "x.y.z" }); // and so did B's change
});
