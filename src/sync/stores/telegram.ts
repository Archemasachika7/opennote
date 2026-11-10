import type { BlobStore, ChunkRef } from "./types";

/**
 * Storage in the user's OWN Telegram bot chat (storage design §7). The token stays on this device.
 * api.telegram.org answers browsers with CORS `*`, so no relay is needed. Bots may upload 50 MB and
 * download 20 MB per file; chunks are 19 MB (../crypto.ts CHUNK_BYTES).
 */
const API = "https://api.telegram.org";
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$|^\d+:[A-Za-z0-9_-]+$/;
const GAP_MS = 1100; // about one message a second per chat
const MAX_TRIES = 5;

type Fetch = typeof fetch;
type TgReply<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

export interface TelegramConfig { token: string; chatId: string; fetch?: Fetch; sleep?: (ms: number) => Promise<void> }

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call<T>(f: Fetch, token: string, method: string, init?: RequestInit, sleep = realSleep): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await f(`${API}/bot${token}/${method}`, init);
    } catch (err) {
      if (attempt >= MAX_TRIES) throw new Error(`Can't reach Telegram: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const body = (await res.json().catch(() => ({ ok: false }))) as TgReply<T>;
    if (body.ok && body.result !== undefined) return body.result;
    const retryAfter = body.parameters?.retry_after;
    if ((res.status === 429 || retryAfter) && attempt < MAX_TRIES) { await sleep((retryAfter ?? 1) * 1000); continue; }
    if (res.status >= 500 && attempt < MAX_TRIES) { await sleep(1000 * 2 ** attempt); continue; }
    if (res.status === 401 || res.status === 404) throw new Error("Telegram rejected the bot token. Paste it again from @BotFather.");
    throw new Error(`Telegram error: ${body.description ?? res.status}`);
  }
}

export async function verifyBotToken(token: string, f: Fetch = fetch): Promise<{ username: string }> {
  const clean = token.trim();
  if (!TOKEN_RE.test(clean)) throw new Error("That doesn't look like a bot token (it should look like 123456:ABC...).");
  const me = await call<{ username?: string; is_bot?: boolean }>(f, clean, "getMe");
  return { username: me.username ?? "" };
}

/** After the user sends /start to their bot, this finds that private chat. */
export async function findChatId(token: string, f: Fetch = fetch): Promise<string | null> {
  const updates = await call<{ message?: { chat?: { id: number; type: string } } }[]>(f, token.trim(), "getUpdates");
  const chat = [...updates].reverse().find((u) => u.message?.chat?.type === "private")?.message?.chat;
  return chat ? String(chat.id) : null;
}

export function createTelegramStore(cfg: TelegramConfig): BlobStore {
  const f = cfg.fetch ?? fetch;
  const sleep = cfg.sleep ?? realSleep;
  const token = cfg.token.trim();
  let last = 0;
  const pace = async () => {
    const wait = last + GAP_MS - Date.now();
    if (last && wait > 0) await sleep(wait);
    last = Date.now();
  };

  return {
    provider: "telegram",
    async put(objectId, chunks) {
      const refs: ChunkRef[] = [];
      for (let i = 0; i < chunks.length; i++) {
        await pace();
        const sent = await call<{ message_id: number; document?: { file_id: string } }>(f, token, "sendDocument", {
          method: "POST",
          body: (() => {
            const fd = new FormData();
            fd.append("chat_id", cfg.chatId);
            fd.append("disable_notification", "true");
            fd.append("document", new Blob([chunks[i] as BlobPart], { type: "application/octet-stream" }), `${objectId}.${i}.bin`);
            return fd;
          })(),
        }, sleep);
        if (!sent.document?.file_id) throw new Error("Telegram did not store the file.");
        refs.push({ ref: `${sent.document.file_id}|${sent.message_id}`, size: chunks[i].byteLength });
      }
      return refs;
    },
    async get(refs) {
      const out: Uint8Array[] = [];
      for (const r of refs) {
        const fileId = r.ref.split("|")[0];
        const file = await call<{ file_path?: string }>(f, token, `getFile?file_id=${encodeURIComponent(fileId)}`, undefined, sleep);
        if (!file.file_path) throw new Error("Telegram could not find a stored file.");
        const res = await f(`${API}/file/bot${token}/${file.file_path}`);
        if (!res.ok) throw new Error(`Telegram download failed (${res.status}).`);
        out.push(new Uint8Array(await res.arrayBuffer()));
      }
      return out;
    },
    async remove(refs) {
      for (const r of refs) {
        const messageId = r.ref.split("|")[1];
        if (!messageId) continue;
        // Telegram only lets bots delete messages for a while; leftovers are ciphertext, so a failure is harmless
        await call(f, token, "deleteMessage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: cfg.chatId, message_id: Number(messageId) }),
        }, sleep).catch(() => undefined);
      }
    },
  };
}
