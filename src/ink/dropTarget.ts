/**
 * Dragging a lasso selection off its page: which page is under the drop point, and where on it.
 * Pages are found in the notebook's DOM (`.page-wrap#page-<id>`, each with an ink surface).
 */
import { PAGE_SIZE } from "../store/schema";

export type DropTarget =
  | { kind: "page"; pageId: string; wrap: HTMLElement; x: number; y: number }
  | { kind: "new"; afterPageId: string; x: number; y: number }
  | { kind: "not-ink"; wrap: HTMLElement };

/** The place under a screen point, or null when it is still the page the selection came from. */
export function dropTargetAt(clientX: number, clientY: number, fromPageId: string): DropTarget | null {
  const wraps = [...document.querySelectorAll<HTMLElement>(".page-wrap[id^='page-']")];
  if (wraps.length === 0) return null;
  const bodyOf = (w: HTMLElement) => w.querySelector<HTMLElement>("[data-testid='ink-surface']");
  const rectOf = (w: HTMLElement) => (bodyOf(w) ?? w).getBoundingClientRect();
  const last = wraps[wraps.length - 1];
  const lastRect = rectOf(last);
  if (clientY > lastRect.bottom) {
    // below the last page: a new page, with the drop landing near its top
    const k = PAGE_SIZE.w / (lastRect.width || PAGE_SIZE.w);
    return { kind: "new", afterPageId: last.id.slice(5), x: (clientX - lastRect.left) * k, y: Math.min(PAGE_SIZE.h, (clientY - lastRect.bottom) * k) };
  }
  // the page whose body is under the point, else the nearest one (drops in the gap between pages)
  let best = wraps[0], bestD = Infinity;
  for (const w of wraps) {
    const r = rectOf(w);
    const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
    if (d < bestD) { bestD = d; best = w; }
  }
  const pageId = best.id.slice(5);
  if (pageId === fromPageId) return null;
  const body = bodyOf(best);
  if (!body) return { kind: "not-ink", wrap: best };
  const r = body.getBoundingClientRect();
  const k = PAGE_SIZE.w / (r.width || PAGE_SIZE.w);
  return { kind: "page", pageId, wrap: best, x: (clientX - r.left) * k, y: (clientY - r.top) * k };
}

/** Outline the page a drag would land on (one at a time). */
export function markDropTarget(wrap: HTMLElement | null): void {
  for (const w of document.querySelectorAll(".page-wrap.drop-target")) if (w !== wrap) w.classList.remove("drop-target");
  wrap?.classList.add("drop-target");
}
