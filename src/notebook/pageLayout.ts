import { useSyncExternalStore } from "react";

/** How a notebook shows its pages: one long scroll, or one page at a time with page turns ("book"). Saved on this device. */
export type PageLayout = "scroll" | "book";

const KEY = "opennote.pageLayout";
const listeners = new Set<() => void>();
const read = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* private browsing */ } };

let layout: PageLayout = read() === "book" ? "book" : "scroll";

export const getPageLayout = (): PageLayout => layout;
export function setPageLayout(next: PageLayout): void {
  if (next === layout) return;
  layout = next; write(next); listeners.forEach((f) => f());
}
export function usePageLayout(): PageLayout {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getPageLayout, getPageLayout);
}

/** The page a turn lands on, or null when there is nothing that way (first page going back, last page going forward). */
export function turnTarget(index: number, delta: 1 | -1, count: number): number | null {
  const to = index + delta;
  return to < 0 || to >= count ? null : to;
}

/** Keys that turn a page in book view. Returns the direction, or 0 when the key is not a page-turn key. */
export function turnKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): 1 | -1 | 0 {
  if (e.ctrlKey || e.metaKey || e.altKey) return 0;
  if (e.key === "ArrowRight" || e.key === "PageDown") return 1;
  if (e.key === "ArrowLeft" || e.key === "PageUp") return -1;
  return 0;
}
