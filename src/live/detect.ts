import type { ArtifactType } from "../store/schema";

const FENCE_RE = /^\s*`{3,}[\w+-]*[^\n]*\n([\s\S]*?)\n?\s*`{3,}\s*$/;
const BUILTIN = new Set(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"]);

export function stripFence(src: string): string {
  const m = FENCE_RE.exec(src);
  return m ? m[1] : src;
}

/** Rules from spec 6.1, applied after removing a surrounding Markdown fence. */
export function detectArtifactType(raw: string): ArtifactType | null {
  const s = stripFence(raw).trim();
  if (!s) return null;
  if (/^<svg[\s>]/i.test(s) || (/^<\?xml/i.test(s) && /<svg[\s>]/i.test(s))) return "svg";
  if (/^<!doctype html|^<html[\s>]/i.test(s)) return "html";
  const reactish = /export\s+default\b/.test(s) || /\bimport\s+React\b/.test(s) || /from\s+["']react["']/.test(s);
  if (reactish && /<[A-Za-z][\w.]*[\s/>]/.test(s)) return "react";
  if (/<body[\s>]|<script[\s>]/i.test(s)) return "html";
  return null;
}

export function bareImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1];
    if (BUILTIN.has(spec) || /^(\.|\/|https?:)/.test(spec)) continue;
    if (!out.includes(spec)) out.push(spec);
  }
  return out;
}

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();

export function titleOf(src: string, type: ArtifactType): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src);
  if (t && strip(t[1])) return strip(t[1]);
  if (type !== "react") {
    const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(src);
    if (h && strip(h[1])) return strip(h[1]);
  } else {
    const fn = /export\s+default\s+function\s+([A-Z]\w*)/.exec(src) ?? /export\s+default\s+([A-Z]\w*)\s*;?/.exec(src);
    if (fn) return words(fn[1]);
  }
  return "Live page";
}
