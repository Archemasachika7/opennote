import { db, type Page } from "../store/schema";
import { textOf } from "../text/textOf";
import { indexHandwriting } from "../store/inkIndex";

/** Visible text of a live (HTML/SVG) page, without its code. */
export function htmlText(source: string): string {
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());
  return (doc.body?.textContent ?? doc.documentElement?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Everything written on a page, as text: typed text, text boxes, chart titles and data, and handwriting (read on the
 * device first when it hasn't been, or the page changed since).
 */
export async function pageText(page: Page, onStatus?: (s: string) => void): Promise<string> {
  if (page.kind === "text") return textOf(page.doc).trim();
  if (page.kind === "html") return [page.title, htmlText(page.source)].filter(Boolean).join("\n").trim();
  const parts: string[] = [];
  const objects = await db.objects.where("pageId").equals(page.id).toArray();
  for (const o of objects.sort((a, b) => a.y - b.y)) {
    if (o.kind === "textbox" && o.text?.trim()) parts.push(o.text.trim());
    if (o.chart) {
      const c = o.chart;
      parts.push(`Chart${c.title ? ` "${c.title}"` : ""} (${c.type}): ${c.labels.map((l, i) => `${l}: ${c.series.map((s) => `${s.name} ${Number.isFinite(s.values[i]) ? s.values[i] : "-"}`).join(", ")}`).join("; ")}`);
    }
  }
  let ink = page.inkText ?? "";
  const stale = (page.inkTextAt ?? 0) < page.updatedAt;
  if ((stale || !ink) && (await db.strokes.where("pageId").equals(page.id).count()) > 0) {
    onStatus?.("Reading your handwriting on this device...");
    try { ink = await indexHandwriting(page.id, onStatus); } catch { /* keep what was read before */ }
  }
  if (ink.trim()) parts.push(ink.trim());
  if (page.background?.pdfText) parts.push(page.background.pdfText);
  return parts.join("\n").trim();
}

/** All pages, each under a "Page N" line, for a notebook-wide summary. */
export async function notebookText(pages: Page[], onStatus?: (s: string) => void): Promise<string> {
  const out: string[] = [];
  for (const [i, p] of pages.entries()) {
    onStatus?.(`Reading page ${i + 1} of ${pages.length}...`);
    const t = await pageText(p, onStatus);
    if (t) out.push(`Page ${i + 1}:\n${t}`);
  }
  return out.join("\n\n");
}
