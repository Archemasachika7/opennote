// @vitest-environment node
import { createTelegramStore, findChatId, verifyBotToken } from "../../src/sync/stores/telegram";
import { putTiered, QuotaError, StorageFullError, SUPABASE_QUOTA_BYTES } from "../../src/sync/stores/router";
import type { BlobStore, ChunkRef } from "../../src/sync/stores/types";

const TOKEN = "123456:ABC-test";
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });

function fakeTelegram() {
  const calls: { url: string; body?: FormData | null }[] = [];
  const files = new Map<string, Uint8Array>();
  let n = 0;
  let throttleOnce = true;
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: (init?.body as FormData) ?? null });
    if (url.endsWith("/sendDocument")) {
      if (throttleOnce) {
        throttleOnce = false;
        return new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 1 } }), { status: 429 });
      }
      const doc = (init!.body as FormData).get("document") as Blob;
      const id = `f${++n}`;
      files.set(id, new Uint8Array(await doc.arrayBuffer()));
      return ok({ message_id: 100 + n, document: { file_id: id } });
    }
    if (url.includes("/getFile")) {
      const id = new URL(url).searchParams.get("file_id")!;
      return ok({ file_path: `documents/${id}.bin` });
    }
    if (url.includes("/file/bot")) {
      const id = url.split("/").pop()!.replace(".bin", "");
      return new Response(files.get(id) as BodyInit);
    }
    if (url.endsWith("/deleteMessage")) return ok(true);
    if (url.endsWith("/getMe")) return ok({ id: 1, is_bot: true, username: "my_notes_bot" });
    if (url.includes("/getUpdates")) return ok([{ update_id: 1, message: { chat: { id: 4242, type: "private" }, text: "/start" } }]);
    return new Response("{}", { status: 404 });
  });
  return { fetchFn, calls, files };
}

describe("Telegram store (the user's own bot)", () => {
  it("uploads each encrypted chunk to the user's chat, retries after a 429, and reads it back", async () => {
    const t = fakeTelegram();
    const waits: number[] = [];
    const store = createTelegramStore({ token: TOKEN, chatId: "4242", fetch: t.fetchFn as typeof fetch, sleep: async (ms) => { waits.push(ms); } });
    const refs = await store.put("obj1", [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);
    expect(refs).toEqual([{ ref: "f1|101", size: 3 }, { ref: "f2|102", size: 2 }]);
    expect(waits).toContain(1000); // honoured retry_after
    const sent = t.calls.filter((c) => c.url.endsWith("/sendDocument"));
    expect(sent[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendDocument`);
    expect(sent.at(-1)!.body!.get("chat_id")).toBe("4242");
    const back = await store.get(refs);
    expect(back.map((b) => Array.from(b))).toEqual([[1, 2, 3], [4, 5]]);
    await store.remove(refs);
    expect(t.calls.filter((c) => c.url.endsWith("/deleteMessage"))).toHaveLength(2);
  });

  it("checks a pasted token and finds the private chat after the user sends /start", async () => {
    const t = fakeTelegram();
    expect(await verifyBotToken(TOKEN, t.fetchFn as typeof fetch)).toEqual({ username: "my_notes_bot" });
    expect(await findChatId(TOKEN, t.fetchFn as typeof fetch)).toBe("4242");
    await expect(verifyBotToken("not a token", t.fetchFn as typeof fetch)).rejects.toThrow(/token/i);
  });
});

function memStore(provider: BlobStore["provider"], opts: { quotaFail?: boolean } = {}): BlobStore & { puts: number } {
  const s = {
    provider, puts: 0,
    async put(id: string, chunks: Uint8Array[]): Promise<ChunkRef[]> {
      s.puts++;
      if (opts.quotaFail) throw new QuotaError();
      return chunks.map((c, i) => ({ ref: `${provider}:${id}.${i}`, size: c.byteLength }));
    },
    async get() { return []; },
    async remove() {},
  };
  return s;
}

describe("tiered storage: Supabase first, Telegram when it would cross the quota", () => {
  const chunks = [new Uint8Array(10)];
  it("uses Supabase while under the per-user quota", async () => {
    const sb = memStore("supabase"), tg = memStore("telegram");
    const r = await putTiered("o", chunks, { primary: sb, fallback: tg, usedBytes: 0 });
    expect(r.provider).toBe("supabase");
    expect(tg.puts).toBe(0);
  });
  it("goes straight to Telegram when this upload would cross the quota", async () => {
    const sb = memStore("supabase"), tg = memStore("telegram");
    const r = await putTiered("o", chunks, { primary: sb, fallback: tg, usedBytes: SUPABASE_QUOTA_BYTES - 5 });
    expect(r.provider).toBe("telegram");
    expect(sb.puts).toBe(0);
  });
  it("falls back to Telegram when the server rejects for quota", async () => {
    const sb = memStore("supabase", { quotaFail: true }), tg = memStore("telegram");
    const r = await putTiered("o", chunks, { primary: sb, fallback: tg, usedBytes: 0 });
    expect(r.provider).toBe("telegram");
  });
  it("says storage is full (instead of failing silently) when Telegram isn't connected", async () => {
    const sb = memStore("supabase", { quotaFail: true });
    await expect(putTiered("o", chunks, { primary: sb, fallback: null, usedBytes: 0 })).rejects.toBeInstanceOf(StorageFullError);
  });
});
