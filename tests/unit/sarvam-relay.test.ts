// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain JS edge function, no types
import handler, { relay } from "../../api/sarvam-stt.js";

const URL_ = "https://opennote.example/api/sarvam-stt";

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request(URL_, {
    method: "POST",
    headers: { origin: "https://opennote.example", "x-sarvam-key": "k", "content-type": "multipart/form-data; boundary=x", ...headers },
    body,
    // a stream body needs half-duplex in Node's fetch
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** A chunked body with no content-length, like a client that hides its size. */
function chunked(total: number, chunk = 64 * 1024) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(chunk, total - sent);
      sent += n;
      c.enqueue(new Uint8Array(n));
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Sarvam relay (security review #4, #5)", () => {
  it("refuses callers from another site", async () => {
    const res = await handler(post("x", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("refuses callers that send no Origin (server-to-server)", async () => {
    const bare = new Request(URL_, { method: "POST", headers: { "x-sarvam-key": "k", "content-type": "text/plain" }, body: "x" });
    expect((await handler(bare)).status).toBe(403);
  });

  it("caps the size while reading, even without content-length", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = await relay(post(chunked(300 * 1024)), { maxBytes: 100 * 1024 });
    expect(res.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards the audio bytes, type and the caller's key to Sarvam", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('{"transcript":"hi"}', { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", upstream);
    const res = await handler(post("audio-bytes"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"transcript":"hi"}');
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/speech-to-text");
    expect(init.headers["api-subscription-key"]).toBe("k");
    expect(init.headers["content-type"]).toBe("multipart/form-data; boundary=x");
    expect(new TextDecoder().decode(init.body)).toBe("audio-bytes");
  });

  it("does not echo internal error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal-host-123")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handler(post("x"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/internal-host-123|ENOTFOUND/);
  });
});
