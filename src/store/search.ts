import { db } from "./schema";
import { textOf } from "../text/textOf";

export type SearchHit = { notebookId: string; pageId?: string; title: string; snippet: string };

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
  const notebooks = await db.notebooks.toArray();
  const titles = new Map(notebooks.map((n) => [n.id, n.title]));
  for (const n of notebooks) if (n.title.toLowerCase().includes(q)) hits.push({ notebookId: n.id, title: n.title, snippet: "Notebook" });
  await db.pages.each((p) => {
    const nbTitle = titles.get(p.notebookId) ?? "";
    if (p.kind === "text") {
      const t = textOf(p.doc);
      if (t.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: nbTitle, snippet: snippetAround(t, q) });
    } else if (p.kind === "html") {
      const body = stripTags(p.source);
      if (p.title.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: p.title, snippet: `Live page in ${nbTitle}` });
      else if (body.toLowerCase().includes(q)) hits.push({ notebookId: p.notebookId, pageId: p.id, title: p.title, snippet: snippetAround(body, q) });
    }
  });
  return hits.slice(0, 50);
}
