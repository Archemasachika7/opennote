/**
 * Runs sync in the app: passphrase unlock, device-only storage settings, and a background loop.
 * Secrets (bot token, Pinata key, the unlocked master key) live in Dexie `syncMeta` on this device only.
 */
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "../store/schema";
import { supabase } from "./supabase";
import { getAuthState, onAuthChange } from "./auth";
import { checkPassphrase, deriveMasterKey, makeKeyCheck, newSalt, PBKDF2_ITERATIONS } from "./crypto";
import { syncAll, type SyncEnv } from "./engine";
import { fromPgBytea, supabaseIndex, toPgBytea } from "./supabaseIndex";
import { createSupabaseStore } from "./stores/supabaseStorage";
import { createTelegramStore, findChatId, verifyBotToken } from "./stores/telegram";
import { createPinataStore } from "./stores/pinata";
import { StorageFullError } from "./stores/router";
import type { BlobStore } from "./stores/types";

const K = { master: "dev:master", telegram: "dev:telegram", pinata: "dev:pinata" } as const;
type TelegramSettings = { token: string; username: string; chatId: string | null };
type PinataSettings = { jwt: string };

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
  await write(K.master, key); // non-extractable CryptoKey: the browser keeps it, scripts can't read its bytes
}

export async function unlockSync(passphrase: string): Promise<void> {
  const user = getAuthState().user;
  if (!supabase || !user) throw new Error("Sign in first.");
  await unlockWithProfile(passphrase, supabase, user.id);
  set({ state: "idle", message: undefined });
  void syncNow();
}

export async function lockSync(): Promise<void> {
  await db.syncMeta.delete(K.master);
  set({ state: getAuthState().status === "signed-in" ? "locked" : "off" });
}

/* ---- storage tiers (device-only settings) ---- */

export async function connectTelegram(token: string): Promise<string> {
  const { username } = await verifyBotToken(token);
  await write(K.telegram, { token: token.trim(), username, chatId: null } satisfies TelegramSettings);
  await refreshStorage();
  return username;
}
export async function linkTelegramChat(): Promise<void> {
  const tg = await read<TelegramSettings>(K.telegram);
  if (!tg) throw new Error("Connect your bot first.");
  const chatId = await findChatId(tg.token);
  if (!chatId) throw new Error(`Open @${tg.username} in Telegram and send /start, then try again.`);
  await write(K.telegram, { ...tg, chatId });
  await refreshStorage();
  void syncNow();
}
export async function connectPinata(jwt: string): Promise<void> {
  if (jwt.trim().split(".").length !== 3) throw new Error("That doesn't look like a Pinata JWT.");
  await write(K.pinata, { jwt: jwt.trim() } satisfies PinataSettings);
  await refreshStorage();
  void syncNow();
}
export async function disconnectStorage(which: "telegram" | "pinata"): Promise<void> {
  await db.syncMeta.delete(which === "telegram" ? K.telegram : K.pinata);
  await refreshStorage();
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

let timer: ReturnType<typeof setInterval> | null = null;
const onHide = () => { if (document.visibilityState === "hidden") void syncNow(); };

/** Start with the app: follows sign-in, syncs every minute, on going to the background and on reconnecting. */
export function startSyncLoop(): void {
  if (!supabase || timer) return;
  const react = async () => {
    await refreshStorage();
    if (getAuthState().status === "signed-in") {
      set({ state: (await read(K.master)) ? "idle" : "locked" });
      void syncNow();
    } else {
      await db.syncMeta.delete(K.master); // signing out locks this device
      set({ state: "off" });
    }
  };
  onAuthChange(() => { void react(); });
  void react();
  timer = setInterval(() => { if (status.state === "idle" || status.state === "error") void syncNow(); }, 60_000);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("online", () => { void syncNow(); });
}
