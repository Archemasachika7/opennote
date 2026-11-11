/**
 * Web clipping: turns a web page's HTML into the article's plain structure (no scripts, styles, menus or ads), then
 * into a Text page document. Runs on the device with DOMParser; nothing in the clipped HTML is ever executed.
 */

export type ClipBlock =
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "p"; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "quote"; text: string }
  | { t: "code"; text: string };

export interface Article { title: string; site: string; description: string; blocks: ClipBlock[] }

const DROP = "script, style, noscript, template, svg, canvas, iframe, object, embed, form, button, input, select, textarea, nav, header, footer, aside, dialog, [hidden], [aria-hidden=true], [role=navigation], [role=banner], [role=contentinfo], [role=complementary]";
const NOISE = /\b(nav|menu|footer|header|sidebar|comments?|share|social|related|promo|advert|ads|cookie|banner|subscribe|newsletter|breadcrumb|popup|modal)\b/i;
const MAX_BLOCKS = 400;
const MAX_CHARS = 80_000;

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();
const meta = (doc: Document, sel: string): string => clean(doc.querySelector(sel)?.getAttribute("content"));

/** The element that holds the article: an <article>/<main> if it has real text, else the block with the most paragraph text. */
function findRoot(body: HTMLElement): HTMLElement {
  const textLen = (el: Element) => clean(el.textContent).length;
  const candidates = [...body.querySelectorAll<HTMLElement>("article, main, [role=main], [itemprop=articleBody]")]
    .filter((el) => textLen(el) > 200)
    .sort((a, b) => textLen(b) - textLen(a));
  if (candidates[0]) return candidates[0];
  // score each paragraph's parent by the paragraph text it holds directly
  const score = new Map<HTMLElement, number>();
  for (const p of body.querySelectorAll("p")) {
    const parent = p.parentElement;
    if (!parent) continue;
    score.set(parent, (score.get(parent) ?? 0) + clean(p.textContent).length);
  }
  let best: HTMLElement = body, bestScore = 0;
  for (const [el, s] of score) if (s > bestScore) { best = el; bestScore = s; }
  return bestScore > 200 ? best : body;
}

function walk(el: Element, out: ClipBlock[], budget: { chars: number }): void {
  for (const child of el.children) {
    if (out.length >= MAX_BLOCKS || budget.chars <= 0) return;
    const tag = child.tagName.toLowerCase();
    const marker = `${child.getAttribute("class") ?? ""} ${child.getAttribute("id") ?? ""}`;
    if (NOISE.test(marker) && clean(child.textContent).length < 600) continue;
    const push = (b: ClipBlock, len: number) => { out.push(b); budget.chars -= len; };
    if (/^h[1-6]$/.test(tag)) {
      const text = clean(child.textContent);
      if (text) push({ t: "h", level: Math.min(3, Number(tag[1])) as 1 | 2 | 3, text }, text.length);
    } else if (tag === "p") {
      const text = clean(child.textContent);
      if (text.length > 1) push({ t: "p", text }, text.length);
    } else if (tag === "ul" || tag === "ol") {
      const items = [...child.children].filter((li) => li.tagName.toLowerCase() === "li").map((li) => clean(li.textContent)).filter(Boolean);
      if (items.length) push({ t: "list", ordered: tag === "ol", items }, items.join(" ").length);
    } else if (tag === "blockquote") {
      const text = clean(child.textContent);
      if (text) push({ t: "quote", text }, text.length);
    } else if (tag === "pre") {
      const text = (child.textContent ?? "").replace(/\s+$/, "");
      if (text.trim()) push({ t: "code", text }, text.length);
    } else if (tag === "table" || tag === "figure" || tag === "img" || tag === "picture" || tag === "video") {
      continue;
    } else if (child.children.length > 0) {
      walk(child, out, budget);
    } else {
      // a bare text container (div/span with only text) reads as a paragraph
      const text = clean(child.textContent);
      if (text.length > 40) push({ t: "p", text }, text.length);
    }
  }
}

export function extractArticle(html: string, url: string): Article {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const title = meta(doc, 'meta[property="og:title"]') || clean(doc.querySelector("title")?.textContent) || clean(doc.querySelector("h1")?.textContent) || host || "Web clip";
  const site = meta(doc, 'meta[property="og:site_name"]') || host;
  const description = meta(doc, 'meta[property="og:description"]') || meta(doc, 'meta[name="description"]');
  doc.querySelectorAll(DROP).forEach((n) => n.remove());
  const blocks: ClipBlock[] = [];
  if (doc.body) walk(findRoot(doc.body), blocks, { chars: MAX_CHARS });
  // the page title is shown once at the top: drop a first heading that repeats it
  if (blocks[0]?.t === "h" && blocks[0].text.toLowerCase() === title.toLowerCase()) blocks.shift();
  return { title, site, description, blocks };
}

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string }[] };
const text = (s: string, marks?: { type: string }[]): Node => ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const para = (...c: Node[]): Node => ({ type: "paragraph", content: c });

/** The Text page for a clip: title, where it came from and when, then the article. It edits like any note. */
export function toTextDoc(a: Article, url: string, clippedAt: Date, note?: string): Node {
  const content: Node[] = [
    { type: "heading", attrs: { level: 1 }, content: [text(a.title)] },
    para(text(`${a.site ? `${a.site} · ` : ""}Clipped ${clippedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`, [{ type: "italic" }])),
    para(text(url, [{ type: "code" }])),
  ];
  if (note) content.push(para(text(note, [{ type: "bold" }])));
  if (a.description && !a.blocks.some((b) => b.t === "p" && b.text === a.description)) {
    content.push({ type: "blockquote", content: [para(text(a.description))] });
  }
  for (const b of a.blocks) {
    if (b.t === "h") content.push({ type: "heading", attrs: { level: Math.min(3, b.level + 1) }, content: [text(b.text)] });
    else if (b.t === "p") content.push(para(text(b.text)));
    else if (b.t === "quote") content.push({ type: "blockquote", content: [para(text(b.text))] });
    else if (b.t === "code") content.push({ type: "codeBlock", content: [text(b.text)] });
    else content.push({ type: b.ordered ? "orderedList" : "bulletList", content: b.items.map((i) => ({ type: "listItem", content: [para(text(i))] })) });
  }
  return { type: "doc", content };
}

/** Only real web links can be clipped. Returns the cleaned link, or null. Accepts "example.com/x" too. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim().replace(/^<|>$/g, "");
  if (!s || /\s/.test(s)) return null;
  if (/^(mailto|javascript|data|file|tel|sms|ftp|blob|about|chrome|intent|content|vbscript):/i.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch { return null; }
}

/** First web link in some shared text ("Look at this https://… via app"). */
export function findUrl(textIn: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(textIn);
  return m ? normalizeUrl(m[0].replace(/[).,;!?]+$/, "")) : null;
}
