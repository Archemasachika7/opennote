import type { ArtifactType } from "../store/schema";
import { bareImports, stripFence } from "./detect";
import { reactBootScript, scriptSafe } from "./runtime/react-boot";

export type Vendor = { react: string; reactDom: string; babel: string };
const TAILWIND = "https://cdn.tailwindcss.com/3.4.17";

export function buildCsp({ allowNetwork }: { allowNetwork: boolean }): string {
  const net = allowNetwork ? " https:" : "";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' blob:${net}`,
    `style-src 'unsafe-inline'${net}`,
    `img-src data: blob:${net}`,
    `font-src data:${net}`,
    ...(allowNetwork ? ["connect-src https:"] : []),
  ].join("; ");
}

const HEIGHT = `<script>(function(){function r(){parent.postMessage({type:"opennote:height",h:Math.ceil(document.documentElement.scrollHeight)},"*")}if(window.ResizeObserver)new ResizeObserver(r).observe(document.documentElement);addEventListener("load",r);r();function p(e){if(e.pointerType==="pen")parent.postMessage({type:"opennote:pen"},"*")}["pointerover","pointermove","pointerdown"].forEach(function(t){addEventListener(t,p,true)});})();</script>`;
const BASE_CSS = "<style>html,body{margin:0}body{font-family:system-ui,sans-serif}.on-error{margin:16px;padding:12px 14px;white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;color:#FF6B6B;background:#1E2028;border-radius:6px}</style>";

function meta(allowNetwork: boolean): string {
  return `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ allowNetwork })}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`;
}

function htmlDoc(source: string, allowNetwork: boolean): string {
  const m = meta(allowNetwork);
  // The CSP must be the very first thing parsed: anything placed before it (a stray <script>, or a
  // "<head>" inside a comment that a regex would match) would run uncovered. The parser hoists a
  // leading <meta> into the implicit <head>; the artifact's own <html>/<head> tags then merge into it.
  const body = source.replace(/^\s*<!doctype[^>]*>/i, "");
  const out = /<html[\s>]/i.test(body) ? `<!DOCTYPE html>${m}${body}` : `<!DOCTYPE html>${m}<body>${body}</body>`;
  return /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${HEIGHT}</body>`) : out + HEIGHT;
}

export function buildSrcdoc(opts: { source: string; type: ArtifactType; allowNetwork: boolean; vendor?: Vendor }): string {
  const source = stripFence(opts.source);
  const m = meta(opts.allowNetwork);
  if (opts.type === "html") return htmlDoc(source, opts.allowNetwork);
  if (opts.type === "svg") {
    return `<!DOCTYPE html><html><head>${m}${BASE_CSS}<style>svg{max-width:100%;height:auto;display:block}</style></head><body>${source}${HEIGHT}</body></html>`;
  }
  const v = opts.vendor;
  if (!v) throw new Error("React runtime not loaded");
  const map: Record<string, string> = {};
  if (opts.allowNetwork) for (const p of bareImports(source)) map[p] = `https://esm.sh/${p}?external=react,react-dom`;
  const tailwind = opts.allowNetwork && /className=/.test(source) ? `<script src="${TAILWIND}"></script>` : "";
  const boot = reactBootScript(source, map);
  const height = HEIGHT.replace(/^<script>|<\/script>$/g, "");
  return `<!DOCTYPE html><html><head>${m}${BASE_CSS}${tailwind}</head><body><div id="root"></div>` +
    `<script>${scriptSafe(v.react)}</script><script>${scriptSafe(v.reactDom)}</script><script>${scriptSafe(v.babel)}</script>` +
    `<script>${boot}\n${height}</script></body></html>`;
}
