import { insertPage } from "../store/pages";
import type { Page } from "../store/schema";

/** Where inserted pictures go: the current ink page, else a new ink page right after the current page. */
export function imageTarget(pages: Pick<Page, "id" | "kind">[], current: number): { pageId: string } | { insertAt: number } {
  const p = pages[current];
  if (p && p.kind === "ink") return { pageId: p.id };
  return { insertAt: pages.length === 0 ? 0 : Math.min(current + 1, pages.length) };
}

export async function resolveImageTarget(notebookId: string, pages: Page[], current: number): Promise<string> {
  const t = imageTarget(pages, current);
  if ("pageId" in t) return t.pageId;
  return (await insertPage(notebookId, t.insertAt, { kind: "ink", template: "blank" })).id;
}
