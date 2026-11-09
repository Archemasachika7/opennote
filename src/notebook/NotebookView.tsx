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
import { sendCommand, setTool, useTool } from "./tool";
import { addImage, pasteImages } from "../ink/objects";
import { platform } from "../platform/port";
import { PasteSheet, type LiveDraft } from "../live/PasteSheet";
import { useSmartPaste } from "../live/useSmartPaste";
import type { HtmlPage } from "../store/schema";
import type { InsertKind } from "./InsertMenu";
import { inkPalette } from "../ink/render";
import { LatencyOverlay } from "../dev/LatencyOverlay";
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
  const [sheet, setSheet] = useState<{ index: number; edit?: HtmlPage; initial?: Partial<LiveDraft> } | null>(null);
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

  const [tool] = useTool();
  const curPage = pages[current];
  useEffect(() => {
    if (tool.tool !== "image") return;
    setTool({ tool: "lasso" });
    if (!curPage || curPage.kind !== "ink") return;
    void platform.openFile(["image/*"]).then((f) => { if (f) void addImage(curPage.id, f); });
  }, [tool.tool, curPage]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable=true]")) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith("image/"));
      if (files.length === 0 || !curPage || curPage.kind !== "ink") return;
      e.preventDefault();
      void pasteImages(files, curPage.id);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [curPage]);

  async function insert(index: number, kind: InsertKind) {
    if (kind === "live") { setSheet({ index }); return; }
    await insertPage(id, index, kind === "ink" ? { kind: "ink", template: "blank" } : { kind: "text" });
  }

  const currentRef = useRef(current);
  currentRef.current = current;
  const pagesLen = useRef(pages.length);
  pagesLen.current = pages.length;
  const onSmartPaste = useCallback((source: string) => {
    setSheet({ index: Math.min(currentRef.current + 1, pagesLen.current), initial: { source } });
  }, []);
  useSmartPaste(onSmartPaste);

  async function saveLive(d: LiveDraft) {
    const s = sheet;
    setSheet(null);
    if (!s) return;
    if (s.edit) { await updatePage(s.edit.id, d); return; }
    const p = await insertPage(id, s.index, { kind: "html", ...d });
    setTimeout(() => document.getElementById(`page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  if (!notebook) return <main className="nb-loading dim">Loading...</main>;
  const cur = pages[current];
  return (
    <div className="nb-view">
      <Toolbar notebook={notebook} zoom={zoom} setZoom={setZoom} palette={inkPalette(notebook.paper)}
        onUndo={() => cur && sendCommand("undo", cur.id)} onRedo={() => cur && sendCommand("redo", cur.id)} />
      <div className="nb-body">
        <Thumbnails pages={pages} bookmarks={notebook.bookmarks} current={current} onJump={jump}
          onInsert={insert} onReorder={(a, b) => movePage(id, a, b)} />
        <div className="nb-scroll" ref={scroller}>
          <div className="nb-column" style={{ width }}>
            <PageList pages={pages} notebook={notebook} mounted={mounted} width={width}
              renderPage={(p, i, m, w) => (
                <PageFrame page={p} notebook={notebook} mounted={m} width={w} priority={1000 - Math.abs(i - current)}
                  onEditLive={(pg) => pg.kind === "html" && setSheet({ index: i, edit: pg, initial: { title: pg.title, source: pg.source, artifactType: pg.artifactType, allowNetwork: pg.allowNetwork } })} />
              )}
              onDuplicate={(p) => duplicatePage(p.id)} onDelete={(p) => deletePage(p.id)}
              onBookmark={(p) => toggleBookmark(id, p.id)} onTemplate={(p, t) => updatePage(p.id, { template: t })} />
          </div>
        </div>
      </div>
      <PasteSheet open={!!sheet} initial={sheet?.initial} onClose={() => setSheet(null)} onSave={saveLive} />
      {new URLSearchParams(window.location.search).get("debug") === "latency" && <LatencyOverlay />}
    </div>
  );
}
