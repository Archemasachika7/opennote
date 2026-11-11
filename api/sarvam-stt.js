export const config = { runtime: "edge" };

export const MAX_BODY_BYTES = 30 * 1024 * 1024;
const UPSTREAM = "https://api.sarvam.ai/speech-to-text";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Only the app's own pages may use the relay: browsers always send Origin on a POST, and it must be this
 * deployment's own host. That turns away other sites and casual server-to-server callers (an Origin header
 * can be forged by a script, so this limits abuse; the relay still never holds a key of its own).
 */
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Reads the body while counting bytes, so a client that hides or lies about content-length can't exceed the cap. */
async function readCapped(req, maxBytes) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/**
 * Same-origin pass-through for Sarvam speech-to-text, used only when the browser can't reach
 * api.sarvam.ai directly (CORS / network). It never holds a key: the caller must send their own
 * in `x-sarvam-key`. No CORS headers, so other sites' pages can't read its answers.
 */
export async function relay(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!sameOrigin(req)) return json(403, { error: "Not allowed" });

  const apiKey = (req.headers.get("x-sarvam-key") || "").trim();
  if (!apiKey) return json(401, { error: "Send your own Sarvam key in x-sarvam-key." });

  // cheap early refusal when the size is declared; the streaming cap below is the real limit
  if (Number(req.headers.get("content-length") || 0) > maxBytes) return json(413, { error: "Audio chunk too large." });

  try {
    const body = await readCapped(req, maxBytes);
    if (body === null) return json(413, { error: "Audio chunk too large." });
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      // the multipart body is passed through untouched, so its boundary in content-type stays valid
      headers: { "api-subscription-key": apiKey, "content-type": req.headers.get("content-type") || "application/octet-stream" },
      body,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    // details stay in the server log; the client gets a plain message
    console.error("sarvam-stt relay failed", err);
    return json(502, { error: "Speech service could not be reached. Try again." });
  }
}

export default function handler(req) {
  return relay(req);
}
