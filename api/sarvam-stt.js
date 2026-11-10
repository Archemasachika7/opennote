export const config = { runtime: "edge" };

const MAX_BODY_BYTES = 30 * 1024 * 1024;

/**
 * Same-origin pass-through for Sarvam speech-to-text, used only when the browser can't reach
 * api.sarvam.ai directly (CORS / network). It never holds a key: the caller must send their own
 * in `x-sarvam-key`. No CORS headers, so other sites can't use it.
 */
export default async function handler(req) {
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = (req.headers.get("x-sarvam-key") || "").trim();
  if (!apiKey) return json(401, { error: "Send your own Sarvam key in x-sarvam-key." });

  const size = Number(req.headers.get("content-length") || 0);
  if (size > MAX_BODY_BYTES) return json(413, { error: "Audio chunk too large." });

  try {
    const formData = await req.formData();
    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: formData,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : String(err) });
  }
}
