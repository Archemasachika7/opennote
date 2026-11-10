import { db } from "./schema";
import { textOf } from "../text/textOf";

export type SearchHitKind = "notebook" | "text" | "live" | "pdf" | "card";
export type SearchHit = { notebookId: string; pageId?: string; title: string; snippet: string; kind?: SearchHitKind };

export function stripTags(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  const start = Math.max(0, i - 30);
  return (start > 0 ? "..." : "") + text.slice(start, i + q.length + 50).trim();
}

export async function searchAll(raw: string): Promise<SearchHit[]> {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const notebooks = (await db.notebooks.toArray()).filter((n) => !n.trashedAt);
  const titles = new Map(notebooks.map((n) => [n.id, n.title]));
  for (const n of notebooks) {
    if (n.title.toLowerCase().includes(q)) hits.push({ notebookId: n.id, title: n.title, snippet: "Notebook", kind: "notebook" });
  }
  await db.pages.each((p) => {
    if (!titles.has(p.notebookId)) return; // trashed notebook
    const nbTitle = titles.get(p.notebookId) ?? "";
    if (p.kind === "ink" && p.background?.pdfText) {
      const t = p.background.pdfText;
      if (t.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: nbTitle, snippet: snippetAround(t, q), kind: "pdf" });
    } else if (p.kind === "text") {
      const t = textOf(p.doc);
      if (t.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: nbTitle, snippet: snippetAround(t, q), kind: "text" });
    } else if (p.kind === "html") {
      const body = stripTags(p.source);
      if (p.title.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: p.title, snippet: `Live page in ${nbTitle}`, kind: "live" });
      else if (body.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: p.title, snippet: snippetAround(body, q), kind: "live" });
    }
  });
  await db.cards.each((c) => {
    if (!titles.has(c.notebookId)) return;
    const text = `${c.front} — ${c.back}`;
    if (text.toLowerCase().includes(q)) hits.push({ notebookId: c.notebookId, title: titles.get(c.notebookId) ?? "", snippet: snippetAround(text, q), kind: "card" });
  });
  return hits.slice(0, 50);
}
