/**
 * Runs sync in the app: passphrase unlock, storage settings shared across devices, and a background loop.
 * The unlocked master key lives in Dexie `syncMeta` on this device only. The bot token and Pinata key are
 * kept there too, and also in profiles.storage_settings encrypted with the master key, so every device
 * signed in to the account gets them after unlocking. The Gemini and Sarvam keys travel the same way;
 * on the device they stay in localStorage, where the AI features read them.
 */
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "../store/schema";
import { supabase } from "./supabase";
import { getAuthState, onAuthChange } from "./auth";
import { checkPassphrase, deriveMasterKey, makeKeyCheck, newSalt, openJson, PBKDF2_ITERATIONS, sealJson } from "./crypto";
import { syncAll, type SyncEnv } from "./engine";
import { fromPgBytea, supabaseIndex, toPgBytea } from "./supabaseIndex";
import { createSupabaseStore } from "./stores/supabaseStorage";
import { createTelegramStore, findChatId, verifyBotToken } from "./stores/telegram";
import { createPinataStore } from "./stores/pinata";
import { StorageFullError } from "./stores/router";
import type { BlobStore } from "./stores/types";
import { getGeminiKey, setGeminiKey } from "../ai/gemini";
import { getSarvamApiKey, hasEnvSarvamKey, setSarvamApiKey } from "../ai/sarvamStt";

const K = { master: "dev:master", telegram: "dev:telegram", pinata: "dev:pinata", owner: "dev:owner" } as const;
type TelegramSettings = { token: string; username: string; chatId: string | null };
type PinataSettings = { jwt: string };
type AiKey = { key: string };

export type SyncState = "off" | "locked" | "idle" | "syncing" | "error";
export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  message?: string;
  storageFull: boolean;
  telegram: { username: string; linked: boolean } | null;
  pinata: boolean;
}

let status: SyncStatus = { state: "off", lastSyncedAt: null, storageFull: false, telegram: null, pinata: false };
const subs = new Set<() => void>();
const set = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; subs.forEach((f) => f()); };
export const getSyncStatus = () => status;
export const useSyncStatus = () =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getSyncStatus);

const read = async <T>(key: string) => ((await db.syncMeta.get(key))?.value as T | undefined) ?? null;
const write = (key: string, value: unknown) => db.syncMeta.put({ key, value });

async function refreshStorage(): Promise<void> {
  const tg = await read<TelegramSettings>(K.telegram);
  set({ telegram: tg ? { username: tg.username, linked: !!tg.chatId } : null, pinata: !!(await read<PinataSettings>(K.pinata)) });
}

/* ---- storage settings shared across devices ---- */

/**
 * A field that is missing means "never set from any device"; null means "disconnected". So a device
 * that had a key before this feature adds it, but can't bring back one another device disconnected.
 */
export type SharedSettings = {
  telegram?: TelegramSettings | null; pinata?: PinataSettings | null; gemini?: AiKey | null; sarvam?: AiKey | null;
};
const STORE_FIELDS = ["telegram", "pinata"] as const;
const AI_FIELDS = ["gemini", "sarvam"] as const;
export type AiField = (typeof AI_FIELDS)[number];

/* ---- AI keys on this device (localStorage) ---- */

const ai: Record<AiField, { get: () => string; set: (key: string) => void }> = {
  gemini: { get: getGeminiKey, set: setGeminiKey },
  // a key built into the app is never uploaded (there is none today; see sarvamStt)
  sarvam: { get: () => (hasEnvSarvamKey() ? "" : getSarvamApiKey()), set: (k) => { if (!hasEnvSarvamKey()) setSarvamApiKey(k); } },
};
/** Which account the AI keys on this device belong to. Absent: entered signed out (or by an older app version). */
const AI_OWNER = "opennote.sharedKeys.owner";
/** AI keys changed on this device and not yet in the account, each with a token naming that change. */
const AI_PENDING = "opennote.sharedKeys.pending";
type Pending = Partial<Record<AiField, number>>;
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const readPending = (): Pending => { try { return JSON.parse(ls.get(AI_PENDING) ?? "{}") as Pending; } catch { return {}; } };
const writePending = (p: Pending) => ls.set(AI_PENDING, Object.keys(p).length ? JSON.stringify(p) : null);
let pendingSeq = 0;
const aiValue = (f: AiField): AiKey | null => { const k = ai[f].get(); return k ? { key: k } : null; };

/** Change an AI key on this device now; it goes to the account on the next upload. */
function setLocalAi(which: AiField, key: string, userId: string | null): void {
  ai[which].set(key.trim());
  if (userId) ls.set(AI_OWNER, userId);
  writePending({ ...readPending(), [which]: Date.now() * 1000 + (pendingSeq++ % 1000) });
}

/** Forget the AI keys of an account that isn't the one using this device. */
function forgetAiKeys(): void {
  for (const f of AI_FIELDS) ai[f].set("");
  ls.set(AI_OWNER, null);
  writePending({});
}

/** The account's copy and its version (profiles.storage_settings_version). */
async function fetchShared(client: SupabaseClient, userId: string, master: CryptoKey): Promise<{ value: SharedSettings; version: number }> {
  const { data, error } = await client.from("profiles").select("storage_settings,storage_settings_version").eq("id", userId).single();
  if (error) throw new Error(`Couldn't read your storage settings: ${error.message}`);
  const row = data as { storage_settings: string | null; storage_settings_version: number | null };
  const version = row.storage_settings_version ?? 0;
  if (!row.storage_settings) return { value: {}, version };
  try {
    return { value: await openJson<SharedSettings>(fromPgBytea(row.storage_settings), master), version };
  } catch {
    throw new Error("Your saved storage settings couldn't be read. Connect Telegram or Pinata, and enter your AI keys, again.");
  }
}

/**
 * Upload only if the account copy is still at `version`, the one this device read. Returns false when
 * another device wrote in between, so the caller reads again instead of erasing that change.
 */
async function pushShared(client: SupabaseClient, userId: string, master: CryptoKey, value: SharedSettings, version: number): Promise<boolean> {
  const { data, error } = await client.from("profiles")
    .update({ storage_settings: toPgBytea(await sealJson(value, master)), storage_settings_version: version + 1 })
    .eq("id", userId).eq("storage_settings_version", version).select("id");
  if (error) throw new Error(`Couldn't save your storage settings to your account: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
const WRITE_TRIES = 3;

/**
 * Put the account's settings on this device. `took` names the AI key changes that went up in `value`:
 * a change made here since then (or one that didn't go up) is newer than the account's copy, so it stays.
 */
async function applyLocal(value: SharedSettings, userId: string, took: Pending): Promise<void> {
  await db.transaction("rw", db.syncMeta, async () => {
    for (const f of STORE_FIELDS) {
      if (value[f] === undefined) continue;
      if (value[f]) await write(K[f], value[f]); else await db.syncMeta.delete(K[f]);
    }
  });
  const pending = readPending();
  let applied = false;
  for (const f of AI_FIELDS) {
    if (pending[f] !== undefined) {
      if (pending[f] !== took[f]) continue;
      delete pending[f];
    }
    if (value[f] === undefined) continue;
    if ((value[f]?.key ?? "") !== ai[f].get()) ai[f].set(value[f]?.key ?? "");
    applied = true;
  }
  writePending(pending);
  if (applied) ls.set(AI_OWNER, userId);
}

/**
 * The account's settings plus any key this device has that the account has never seen, and this
 * device's AI key changes that haven't gone up yet. AI keys of another account are never added.
 */
async function mergedShared(client: SupabaseClient, userId: string, master: CryptoKey) {
  const fetched = await fetchShared(client, userId, master);
  const value = { ...fetched.value };
  let added = false;
  for (const f of STORE_FIELDS) {
    const mine = await read<TelegramSettings & PinataSettings>(K[f]);
    if (value[f] === undefined && mine) { value[f] = mine; added = true; }
  }
  const owner = ls.get(AI_OWNER);
  const pending = readPending();
  const took: Pending = {};
  if (owner === null || owner === userId) {
    for (const f of AI_FIELDS) {
      const mine = aiValue(f);
      if (pending[f] !== undefined) { value[f] = mine; took[f] = pending[f]; added = true; }
      else if (value[f] === undefined && mine) { value[f] = mine; added = true; }
    }
  }
  return { value, added, version: fetched.version, took };
}

/** Take the account's storage settings onto this device (adding this device's never-shared keys first). Testable core. */
export async function loadSharedSettings(client: SupabaseClient, userId: string, master: CryptoKey): Promise<void> {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const { value, added, version, took } = await mergedShared(client, userId, master);
    if (!added || (await pushShared(client, userId, master, value, version))) {
      await applyLocal(value, userId, took);
      return;
    }
  }
  // another device kept writing: take its copy as is; this device's extra keys go up on the next pull
  await applyLocal((await fetchShared(client, userId, master)).value, userId, {});
}

/**
 * Change the storage settings: read the account's current copy, apply the change, upload, and only
 * then change this device. A failed upload leaves everything as it was. If another device wrote in
 * between, read again and reapply the change. Testable core.
 */
export async function updateSharedSettings(
  client: SupabaseClient, userId: string, master: CryptoKey, change: (current: SharedSettings) => SharedSettings,
): Promise<void> {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const { value, version, took } = await mergedShared(client, userId, master);
    const next = change(value);
    if (await pushShared(client, userId, master, next, version)) {
      await applyLocal(next, userId, took);
      return;
    }
  }
  throw new Error("Your storage settings were changed on another device at the same time. Try again.");
}

/**
 * Keys on this device belong to the account that unlocked it. Signing out, or a different account
 * signing in, forgets them, so they can never be uploaded into someone else's account.
 */
export async function forgetOtherAccount(userId: string | null): Promise<void> {
  // AI keys: kept while their account (or no account, if entered signed out) uses the device. They are
  // also usable without sync, so unlike the storage keys, signing in alone never clears unowned ones.
  const aiOwner = ls.get(AI_OWNER);
  if (aiOwner !== null && aiOwner !== userId) forgetAiKeys();
  const owner = await read<string>(K.owner);
  // No owner means keys from the previous app version. Their account can't be checked (that version
  // kept them after sign-out), so they're cleared: re-enter them once, then they're shared.
  if (userId && owner === userId) return;
  await db.syncMeta.bulkDelete([K.master, K.telegram, K.pinata, K.owner]);
}

/**
 * Runs settings changes one at a time, so a background pull can't delete a token between it being
 * saved on this device and uploaded to the account.
 */
let settingsChain: Promise<unknown> = Promise.resolve();
export function withSettingsLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = settingsChain.then(fn, fn);
  settingsChain = next.catch(() => undefined);
  return next;
}

/** Change the storage settings in the account and on this device. Needs sync unlocked (the panel only offers it then). */
async function changeSettings(change: (current: SharedSettings) => SharedSettings): Promise<void> {
  const user = getAuthState().user;
  const master = await read<CryptoKey>(K.master);
  if (!supabase || !user || !master) throw new Error("Unlock sync first.");
  await withSettingsLock(() => updateSharedSettings(supabase!, user.id, master, change));
  await refreshStorage();
}

/** Unlock (or set up, the first time) the sync passphrase for this account. Testable core. */
export async function unlockWithProfile(passphrase: string, client: SupabaseClient, userId: string, iterations = PBKDF2_ITERATIONS): Promise<void> {
  const { data, error } = await client.from("profiles").select("kdf_salt,key_check").eq("id", userId).single();
  if (error) throw new Error(`Couldn't read your account: ${error.message}`);
  const row = data as { kdf_salt: string | null; key_check: string | null };
  let key: CryptoKey;
  if (!row.kdf_salt || !row.key_check) {
    const salt = newSalt();
    key = await deriveMasterKey(passphrase, salt, iterations);
    const { error: upErr } = await client.from("profiles")
      .update({ kdf_salt: toPgBytea(salt), key_check: toPgBytea(await makeKeyCheck(key)) }).eq("id", userId);
    if (upErr) throw new Error(`Couldn't save your sync setup: ${upErr.message}`);
  } else {
    key = await deriveMasterKey(passphrase, fromPgBytea(row.kdf_salt), iterations);
    if (!(await checkPassphrase(key, fromPgBytea(row.key_check)))) throw new Error("Wrong sync passphrase.");
  }
  await forgetOtherAccount(userId);
  await write(K.owner, userId);
  await write(K.master, key); // non-extractable CryptoKey: the browser keeps it, scripts can't read its bytes
}

export async function unlockSync(passphrase: string): Promise<void> {
  const user = getAuthState().user;
  if (!supabase || !user) throw new Error("Sign in first.");
  await unlockWithProfile(passphrase, supabase, user.id);
  set({ state: "idle", message: undefined });
  try {
    const master = (await read<CryptoKey>(K.master))!;
    await withSettingsLock(() => loadSharedSettings(supabase!, user.id, master));
  } catch (err) {
    set({ message: err instanceof Error ? err.message : String(err) });
  }
  await refreshStorage();
  void syncNow();
}

export async function lockSync(): Promise<void> {
  await db.syncMeta.delete(K.master);
  set({ state: getAuthState().status === "signed-in" ? "locked" : "off" });
}

/* ---- storage tiers (saved on this device and, encrypted, in the account) ---- */

export async function connectTelegram(token: string): Promise<string> {
  const { username } = await verifyBotToken(token);
  const telegram: TelegramSettings = { token: token.trim(), username, chatId: null };
  await changeSettings((cur) => ({ ...cur, telegram }));
  return username;
}
export async function linkTelegramChat(): Promise<void> {
  const tg = await read<TelegramSettings>(K.telegram);
  if (!tg) throw new Error("Connect your bot first.");
  const chatId = await findChatId(tg.token);
  if (!chatId) throw new Error(`Open @${tg.username} in Telegram and send /start, then try again.`);
  await changeSettings((cur) => {
    // the bot may have been changed or disconnected on another device meanwhile
    if (cur.telegram?.token !== tg.token) throw new Error("Your Telegram bot changed on another device. Check it and try again.");
    return { ...cur, telegram: { ...cur.telegram, chatId } };
  });
  void syncNow();
}
export async function connectPinata(jwt: string): Promise<void> {
  if (jwt.trim().split(".").length !== 3) throw new Error("That doesn't look like a Pinata JWT.");
  const pinata: PinataSettings = { jwt: jwt.trim() };
  await changeSettings((cur) => ({ ...cur, pinata }));
  void syncNow();
}
export async function disconnectStorage(which: "telegram" | "pinata"): Promise<void> {
  await changeSettings((cur) => ({ ...cur, [which]: null }));
}

/* ---- AI keys: entered once, on every device of the account ---- */

type AccountEnv = { client: SupabaseClient; userId: string; master: CryptoKey };

/**
 * Save (or, with "", remove) an AI key: on this device at once, then in the account when `env` is given
 * (sync unlocked). Without it, or if the upload fails, the change goes up on the next sync and the
 * account's older copy can't overwrite it meanwhile. Testable core.
 */
export async function saveAiKey(env: AccountEnv | null, which: AiField, key: string, userId: string | null = env?.userId ?? null): Promise<void> {
  setLocalAi(which, key, userId);
  if (env) await withSettingsLock(() => updateSharedSettings(env.client, env.userId, env.master, (cur) => cur));
}

/** What the Settings fields call: save the key, and share it with the account's other devices. */
export async function saveSharedKey(which: AiField, key: string): Promise<void> {
  const auth = getAuthState();
  const user = auth.status === "signed-in" ? auth.user ?? null : null;
  setLocalAi(which, key, user?.id ?? null); // usable on this device right away
  const master = user ? await read<CryptoKey>(K.master) : null;
  if (!supabase || !user || !master) return; // goes up once sync is unlocked
  try {
    await withSettingsLock(() => updateSharedSettings(supabase!, user.id, master, (cur) => cur));
  } catch (err) {
    set({ message: `${err instanceof Error ? err.message : String(err)} Your key is saved on this device and will reach your other devices on the next sync.` });
  }
}

/* ---- the loop ---- */

async function buildEnv(): Promise<SyncEnv | null> {
  const user = getAuthState().user;
  const master = await read<CryptoKey>(K.master);
  if (!supabase || !user || !master) return null;
  const stores: BlobStore[] = [createSupabaseStore(supabase, user.id)];
  const tg = await read<TelegramSettings>(K.telegram);
  if (tg?.chatId) stores.push(createTelegramStore({ token: tg.token, chatId: tg.chatId }));
  const pin = await read<PinataSettings>(K.pinata);
  if (pin) stores.push(createPinataStore({ jwt: pin.jwt }));
  return { index: supabaseIndex(supabase, user.id), stores, master };
}

let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    // take other devices' storage changes first, so this run uses the current tiers
    const user = getAuthState().user;
    const master = await read<CryptoKey>(K.master);
    if (supabase && user && master) {
      try {
        await withSettingsLock(() => loadSharedSettings(supabase!, user.id, master));
        await refreshStorage();
      } catch { /* keep this device's settings; the sync below still runs */ }
    }
    const env = await buildEnv();
    if (!env) { set({ state: getAuthState().status === "signed-in" ? "locked" : "off" }); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { set({ state: "idle", message: "Offline. Sync resumes when you're back online." }); return; }
    set({ state: "syncing", message: undefined });
    try {
      const r = await syncAll(env);
      const full = r.errors.some((e) => /storage is full/i.test(e));
      set({
        state: r.errors.length ? "error" : "idle",
        lastSyncedAt: r.errors.length ? status.lastSyncedAt : Date.now(),
        storageFull: full,
        message: full ? new StorageFullError().message
          : r.errors[0] ?? (r.conflicts ? `${r.conflicts} conflict ${r.conflicts === 1 ? "copy" : "copies"} kept. Check your library.` : undefined),
      });
    } catch (err) {
      set({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })().finally(() => { running = null; });
  return running;
}

/**
 * What sign-in changes do to this device's sync key and storage keys. Testable core.
 * The app starts "signed out" for a moment before a saved login loads; that must not lock sync,
 * so only a real sign-out (a user before, none now) or a different account forgets them.
 */
export async function reactToAuth(prevUserId: string | null, userId: string | null): Promise<void> {
  if (userId) await withSettingsLock(() => forgetOtherAccount(userId));
  else if (prevUserId) await withSettingsLock(() => forgetOtherAccount(null));
}

let timer: ReturnType<typeof setInterval> | null = null;
const onHide = () => { if (document.visibilityState === "hidden") void syncNow(); };

/** Start with the app: follows sign-in, syncs every minute, on going to the background and on reconnecting. */
export function startSyncLoop(): void {
  if (!supabase || timer) return;
  let lastUserId: string | null = null;
  const react = async () => {
    const uid = getAuthState().status === "signed-in" ? getAuthState().user?.id ?? null : null;
    const prev = lastUserId;
    lastUserId = uid;
    await reactToAuth(prev, uid);
    await refreshStorage();
    if (uid) {
      set({ state: (await read(K.master)) ? "idle" : "locked" });
      void syncNow();
    } else {
      set({ state: "off" });
    }
  };
  onAuthChange(() => { void react(); });
  void react();
  timer = setInterval(() => { if (status.state === "idle" || status.state === "error") void syncNow(); }, 60_000);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("online", () => { void syncNow(); });
}
