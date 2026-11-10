export const config = { runtime: "edge" };

/**
 * Optional Vercel Edge Function proxy for Sarvam AI Speech-to-Text (`saaras:v3`).
 * Supports either:
 *  - Server-side `process.env.SARVAM_API_KEY` set in Vercel Project Settings, or
 *  - Client-supplied `x-sarvam-key` header (used as automatic CORS fallback).
 */
export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-sarvam-key",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const envKey = typeof process !== "undefined" && process.env ? (process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY || "") : "";
  const headerKey = req.headers.get("x-sarvam-key") || "";
  const apiKey = (headerKey || envKey).trim();

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SARVAM_API_KEY is not configured on the server and no x-sarvam-key header was provided." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const formData = await req.formData();
    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: formData,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
