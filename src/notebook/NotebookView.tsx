import { useCallback, useEffect, useRef, useState } from "react";
import type { Notebook, Page } from "../store/schema";
import { getNotebook, toggleBookmark } from "../store/notebooks";
import { deletePage, duplicatePage, getPages, insertPage, movePage, updatePage } from "../store/pages";
import { useLive } from "../store/useLive";
import { Toolbar } from "./Toolbar";
import { Thumbnails } from "./Thumbnails";
import { PageList } from "./PageList";
import { PageFrame } from "./PageFrame";
import { useVisiblePages } from "./useVisiblePages";
import { usePinchZoom } from "./usePinchZoom";
import { sendCommand } from "./tool";
import type { InsertKind } from "./InsertMenu";
import "./notebook.css";

const BASE_WIDTH = 860;
export const clampZoom = (z: number): number => Math.min(4, Math.max(0.5, z));

export function NotebookView({ id, pageId }: { id: string; pageId?: string }) {
  const notebook = useLive(() => getNotebook(id), [id], undefined as Notebook | undefined);
  const pages = useLive(() => getPages(id), [id], [] as Page[]);
  const scroller = useRef<HTMLDivElement>(null);
  const { mounted, current } = useVisiblePages(scroller, pages.length);
  const [zoom, setZoomRaw] = useState(1);
  const setZoom = useCallback((z: number) => setZoomRaw(clampZoom(z)), []);
  const [liveInsertAt, setLiveInsertAt] = useState<number | null>(null);
  const width = BASE_WIDTH * zoom;
  usePinchZoom(scroller, setZoomRaw, clampZoom);

  const jump = useCallback((i: number) => {
    const p = pages[i];
    if (p) document.getElementById(`page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pages]);

  const hasPages = pages.length > 0;
  useEffect(() => {
    if (!pageId || !hasPages) return;
    const i = pages.findIndex((p) => p.id === pageId);
    if (i >= 0) jump(i);
  }, [pageId, hasPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const p = pages[current];
      if (!p) return;
      e.preventDefault();
      sendCommand(e.shiftKey ? "redo" : "undo", p.id);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pages, current]);

  async function insert(index: number, kind: InsertKind) {
    if (kind === "live") { setLiveInsertAt(index); return; }
    await insertPage(id, index, kind === "ink" ? { kind: "ink", template: "blank" } : { kind: "text" });
  }

  if (!notebook) return <main className="nb-loading dim">Loading...</main>;
  const cur = pages[current];
  return (
    <div className="nb-view">
      <Toolbar notebook={notebook} zoom={zoom} setZoom={setZoom}
        onUndo={() => cur && sendCommand("undo", cur.id)} onRedo={() => cur && sendCommand("redo", cur.id)} />
      <div className="nb-body">
        <Thumbnails pages={pages} bookmarks={notebook.bookmarks} current={current} onJump={jump}
          onInsert={insert} onReorder={(a, b) => movePage(id, a, b)} />
        <div className="nb-scroll" ref={scroller} data-live-insert={liveInsertAt ?? undefined}>
          <div className="nb-column" style={{ width }}>
            <PageList pages={pages} notebook={notebook} mounted={mounted} width={width}
              renderPage={(p, _i, m, w) => <PageFrame page={p} notebook={notebook} mounted={m} width={w} />}
              onDuplicate={(p) => duplicatePage(p.id)} onDelete={(p) => deletePage(p.id)}
              onBookmark={(p) => toggleBookmark(id, p.id)} onTemplate={(p, t) => updatePage(p.id, { template: t })} />
          </div>
        </div>
      </div>
    </div>
  );
}
