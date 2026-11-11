import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, PenLine, Plus, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { MAX_HTML_BYTES, type HtmlPage, type InkPage, type Notebook, type Page, type PageObject } from "../store/schema";
import { detectArtifactType, titleOf } from "../live/detect";
import { getNotebook, listNotebooks, restoreNotebook, toggleBookmark } from "../store/notebooks";
import { navigate } from "../App";
import { deletePageWithUndo, duplicatePage, getPages, insertPage, movePage, restoreDeletedPage, updatePage } from "../store/pages";
import { useLive } from "../store/useLive";
import { Toolbar } from "./Toolbar";
import { Thumbnails } from "./Thumbnails";
import { PageList } from "./PageList";
import { PageFrame } from "./PageFrame";
import { useVisiblePages } from "./useVisiblePages";
import { BookView } from "./BookView";
import { ChartSheet, onChartEditorRequest, openChartEditor, type ChartRequest } from "../charts/ChartSheet";
import { renderChartPng } from "../charts/render";
import type { ChartSpec } from "../charts/spec";
import { addChart, updateChart } from "../ink/objects";
import { addVideo } from "../ink/video";
import { setPageLayout, turnTarget, usePageLayout } from "./pageLayout";
import { restoreAnchor, usePinchZoom, type ZoomAnchor } from "./usePinchZoom";
import { useStudioShortcuts } from "./useStudioShortcuts";
import { sendCommand, sendStampElement, setTool, useTool } from "./tool";
import { addImage, pasteImages, setAllTape } from "../ink/objects";
import { resolveImageTarget } from "./imageTarget";
import { CLIP_MARKER, clipboardSize, hasClipboard, pasteClipboard, useClipboardVersion } from "../ink/clipboard";
import { askPlace, PlaceHost } from "./PlacePicker";
import { exportPagesPdf } from "../io/exportPdf";
import { BACKUP_EXT, exportBackup } from "../io/backup";
import { exportPagesJpg } from "../io/exportImages";
import { importPdf } from "../io/pdfImport";
import { rotatePage } from "../ink/rotate";
import { ExportSheet, type ExportRequest } from "./ExportSheet";
import { toast } from "../ui/Toast";
import { platform } from "../platform/port";
import { PasteSheet, type LiveDraft } from "../live/PasteSheet";
import { blotReact } from "../ui/blotBus";
import { useSmartPaste } from "../live/useSmartPaste";
import { LayersSheet } from "../ink/LayersSheet";
import { ElementsSheet } from "../ink/ElementsSheet";
import { RulerOverlay } from "../ink/RulerOverlay";
import { InsertMenu, type InsertKind } from "./InsertMenu";
import { inkPalette } from "../ink/render";
import { LatencyOverlay } from "../dev/LatencyOverlay";
import { PalmOverlay } from "../dev/PalmOverlay";
import { TemplatesSheet } from "./TemplatesSheet";
import { getEffectiveTemplate, hydratePageTemplates, setStemTemplateForPage } from "../store/templates";
import { AudioBar } from "./AudioBar";
import { RecognizeSheet } from "./RecognizeSheet";
import { UnlockScreen } from "../library/LockSheet";
import { onRecognizeRequest, useInkSearch, type RecognizeRequest } from "../ai/inkOcr";
import { indexHandwriting } from "../store/inkIndex";
import { SpeechNoteModal } from "./SpeechNoteModal";
import { ZoomWritingWindow } from "./ZoomBox";
import { generateCardFromSelection, generateCardsFromPageTapes } from "../study/occlusion";
import type { Box } from "../ink/geometry";
import "./notebook.css";

const BASE_WIDTH = 860;
const MOBILE_BP = 760;
/** File-system safe file name (no reserved characters). */
export const safeName = (name: string): string => name.replace(/[<>:"/|?*]+/g, "-").trim() || "notebook";
export const clampZoom = (z: number): number => Math.min(4, Math.max(0.35, z));

function initialMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth < MOBILE_BP;
}

function initialZoom(): number {
  if (initialMobile()) return clampZoom((window.innerWidth - 24) / BASE_WIDTH);
  return 1;
}

function SplitCompanionPane({
  primaryNotebookId,
  onClose,
}: {
  primaryNotebookId: string;
  onClose: () => void;
}) {
  const allNotebooks = useLive(async () => (await listNotebooks()).filter((n) => (n.kind ?? "notebook") === "notebook"), [], [] as Notebook[]);
  const [docId, setDocId] = useState(primaryNotebookId);
  const [pageIdx, setPageIdx] = useState(0);
  const [splitZoom, setSplitZoom] = useState(0.76);

  const splitNb = useLive(async () => (await getNotebook(docId)) ?? null, [docId], null as Notebook | null);
  const splitPages = useLive(() => getPages(docId), [docId], [] as Page[]);

  useEffect(() => {
    setPageIdx(0);
  }, [docId]);

  const safeIdx = Math.min(pageIdx, Math.max(0, splitPages.length - 1));
  const activePage = splitPages[safeIdx];
  const paneWidth = Math.round(BASE_WIDTH * splitZoom);

  return (
    <aside className="split-pane" data-testid="split-pane" aria-label="Split reference pane">
      <header className="split-pane-head">
        <select
          className="input"
          aria-label="Split pane document"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          style={{ maxWidth: 190 }}>
          {allNotebooks.map((n) => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
        {splitPages.length > 0 && (
          <select
            className="input"
            aria-label="Split pane page"
            value={String(safeIdx)}
            onChange={(e) => setPageIdx(Number(e.target.value))}>
            {splitPages.map((_p, i) => (
              <option key={i} value={String(i)}>Page {i + 1} / {splitPages.length}</option>
            ))}
          </select>
        )}
        <div className="split-pane-zoom">
          <button type="button" className="btn ghost icon" aria-label="Split zoom out" onClick={() => setSplitZoom((z) => clampZoom(z / 1.15))}>
            <ZoomOut size={14} strokeWidth={1.5} />
          </button>
          <span className="mono dim small">{Math.round(splitZoom * 100)}%</span>
          <button type="button" className="btn ghost icon" aria-label="Split zoom in" onClick={() => setSplitZoom((z) => clampZoom(z * 1.15))}>
            <ZoomIn size={14} strokeWidth={1.5} />
          </button>
          <button type="button" className="btn ghost icon" aria-label="Close split screen" onClick={onClose}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="split-pane-scroll nb-scroll">
        {splitNb && activePage ? (
          <div className="nb-column" style={{ width: paneWidth }}>
            <PageFrame page={activePage} notebook={splitNb} mounted width={paneWidth} priority={500} />
          </div>
        ) : (
          <p className="dim" style={{ padding: 24, textAlign: "center" }}>No pages in selected notebook.</p>
        )}
      </div>
    </aside>
  );
}

export function NotebookView({ id, pageId, onOpenSettings }: { id: string; pageId?: string; onOpenSettings?: () => void }) {
  const notebook = useLive(async () => (await getNotebook(id)) ?? null, [id], undefined as Notebook | null | undefined);
  const pages = useLive(() => getPages(id), [id], [] as Page[]);
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useVisiblePages(scroller, pages.length);
  const layout = usePageLayout();
  const book = layout === "book";
  // book view: one page at a time; `turnDir` picks which way the page-turn animation swings
  const [bookIndexRaw, setBookIndex] = useState(0);
  const [turnDir, setTurnDir] = useState<1 | -1>(1);
  const bookIndex = Math.min(bookIndexRaw, Math.max(0, pages.length - 1));
  const current = book ? bookIndex : seen.current;
  const mounted = book ? new Set([bookIndex]) : seen.mounted;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const bookRef = useRef(book);
  bookRef.current = book;
  const bookIndexRef = useRef(bookIndex);
  bookIndexRef.current = bookIndex;
  const showIndex = useCallback((i: number, block: ScrollLogicalPosition = "start") => {
    const p = pagesRef.current[i];
    if (!p) return;
    if (bookRef.current) {
      const from = bookIndexRef.current;
      if (i !== from) setTurnDir(i > from ? 1 : -1);
      bookIndexRef.current = i;
      setBookIndex(i);
      scroller.current?.scrollTo?.({ top: 0 });
    } else {
      document.getElementById(`page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block });
    }
  }, []);
  /** Bring a page into view once it exists (new pages arrive a moment after they are written). */
  const reveal = useCallback((pageId: string, block: ScrollLogicalPosition = "start", delay = 60) => {
    setTimeout(() => {
      const i = pagesRef.current.findIndex((p) => p.id === pageId);
      if (i >= 0) showIndex(i, block);
      else setTimeout(() => { const j = pagesRef.current.findIndex((p) => p.id === pageId); if (j >= 0) showIndex(j, block); }, 250);
    }, delay);
  }, [showIndex]);
  const turnPage = (delta: 1 | -1) => {
    const to = turnTarget(bookIndex, delta, pages.length);
    if (to !== null) showIndex(to);
  };
  const toggleLayout = () => {
    if (book) {
      const keep = pages[bookIndex]?.id;
      setPageLayout("scroll");
      if (keep) setTimeout(() => document.getElementById(`page-${keep}`)?.scrollIntoView({ block: "start" }), 30);
    } else {
      setBookIndex(seen.current);
      setPageLayout("book");
    }
  };
  const [zoom, setZoomRaw] = useState(initialZoom);
  const setZoom = useCallback((z: number) => setZoomRaw(clampZoom(z)), []);
  const [sidebarOpen, setSidebarOpen] = useState(() => !initialMobile());
  const [splitOpen, setSplitOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [speechNoteOpen, setSpeechNoteOpen] = useState(false);
  const [elementsOpen, setElementsOpen] = useState(false);
  const [templatesFor, setTemplatesFor] = useState<Page | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busyJob, setBusyJob] = useState<{ label: string; done: number; total: number } | null>(null);
  const [sheet, setSheet] = useState<{ index: number; edit?: HtmlPage; initial?: Partial<LiveDraft> } | null>(null);
  const [layersFor, setLayersFor] = useState<string | null>(null);
  const [addAt, setAddAt] = useState<number | null>(null);
  const [recog, setRecog] = useState<RecognizeRequest | null>(null);
  const clipVersion = useClipboardVersion();
  const clipSize = clipboardSize();
  const [pasteHidden, setPasteHidden] = useState(false);
  useEffect(() => { setPasteHidden(false); }, [clipVersion]);
  const pasteTo = async (pageId: string) => {
    await pasteClipboard(pageId);
    toast("Pasted. Use the lasso to move it.");
    reveal(pageId, "nearest");
  };
  useEffect(() => onRecognizeRequest(setRecog), []);
  const [chartReq, setChartReq] = useState<ChartRequest | null>(null);
  useEffect(() => onChartEditorRequest(setChartReq), []);
  const inkSearch = useInkSearch();
  const width = BASE_WIDTH * zoom;
  const column = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingAnchor = useRef<ZoomAnchor | null>(null);
  usePinchZoom({
    scroller, column, ready: !!notebook && !notebook.trashedAt && pages.length > 0,
    getZoom: () => zoomRef.current, clamp: clampZoom,
    commit: (z, anchor) => { pendingAnchor.current = anchor; setZoomRaw(z); },
  });
  // keep the pinched point under the fingers once the pages re-laid out at the new zoom
  useLayoutEffect(() => {
    const a = pendingAnchor.current;
    pendingAnchor.current = null;
    if (a && scroller.current) restoreAnchor(scroller.current, a);
  }, [zoom]);

  useEffect(() => { void hydratePageTemplates(); }, []);

  const jump = useCallback((i: number) => {
    showIndex(i);
    if (initialMobile()) setSidebarOpen(false);
  }, [showIndex]);

  const hasPages = pages.length > 0;
  useEffect(() => {
    if (!pageId || !hasPages) return;
    const i = pages.findIndex((p) => p.id === pageId);
    if (i >= 0) jump(i);
  }, [pageId, hasPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const curPage = pages[current];

  // "Search handwriting": a few seconds after writing stops, read the page being written on (on-device)
  const indexing = useRef(false);
  const staleInk = curPage?.kind === "ink" && !curPage.board && (curPage.inkTextAt ?? 0) < curPage.updatedAt;
  useEffect(() => {
    if (!inkSearch || !staleInk || !curPage) return;
    const t = window.setTimeout(() => {
      if (indexing.current) return;
      indexing.current = true;
      void indexHandwriting(curPage.id).catch(() => undefined).finally(() => { indexing.current = false; });
    }, 5000);
    return () => window.clearTimeout(t);
  }, [inkSearch, staleInk, curPage?.id, curPage?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useStudioShortcuts({
    onUndo: () => curPage && sendCommand("undo", curPage.id),
    onRedo: () => curPage && sendCommand("redo", curPage.id),
    onToggleSidebar: () => setSidebarOpen((v) => !v),
  });

  const [tool] = useTool();
  const lastTool = useRef(tool.tool);
  useEffect(() => {
    if (tool.tool !== "image") { lastTool.current = tool.tool; return; }
    setTool({ tool: lastTool.current });
    const snapshot = { pages, current };
    void platform.openFiles(["image/*", "video/*"]).then(async (files) => {
      if (files.length === 0) return;
      const here = snapshot.pages[snapshot.current];
      const what = files.every((f) => f.type.startsWith("video/")) ? (files.length === 1 ? "the video" : `${files.length} videos`)
        : files.length === 1 ? "the picture" : `${files.length} pictures`;
      const targetPageId = here?.kind === "ink" ? here.id
        : snapshot.pages.length === 0 ? await resolveImageTarget(id, snapshot.pages, snapshot.current)
        : await askPlace({ title: `Put ${what} on…`, fromPageId: here?.id, allowCurrent: false });
      if (!targetPageId) return;
      for (const f of files) {
        if (!f.type.startsWith("video/")) { await addImage(targetPageId, f); continue; }
        toast(`Adding "${f.name}"...`);
        try { await addVideo(targetPageId, f); toast("Video added. Tap play to watch it on the page."); }
        catch (e) { toast(e instanceof Error ? e.message : String(e)); }
      }
      if (targetPageId !== here?.id) reveal(targetPageId);
    });
  }, [tool.tool]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (hasClipboard() && (text === CLIP_MARKER || text === "")) {
        e.preventDefault();
        const here = pages[current];
        if (here?.kind === "ink") void pasteClipboard(here.id);
        else void askPlace({ title: "Paste on…", fromPageId: here?.id, allowCurrent: false }).then((to) => { if (to) void pasteClipboard(to); });
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      const here = pages[current];
      if (here?.kind === "ink") void pasteImages(files, here.id);
      else void askPlace({ title: "Put the picture on…", fromPageId: here?.id, allowCurrent: false }).then((to) => { if (to) void pasteImages(files, to); });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [id, pages, current]);

  async function insert(index: number, kind: InsertKind) {
    if (kind === "live") { setSheet({ index }); return; }
    if (kind === "file") {
      const f = await platform.openFile([".svg", ".html", ".htm", "image/svg+xml", "text/html"]);
      if (!f) return;
      try {
        const source = await f.text();
        if (source.length > MAX_HTML_BYTES) { toast(`"${f.name}" is too large for a live page (max ${Math.round(MAX_HTML_BYTES / 1024)} KB).`); return; }
        const artifactType = /\.svg$/i.test(f.name) || f.type === "image/svg+xml" ? "svg" : detectArtifactType(source) === "svg" ? "svg" : "html";
        const fromFile = f.name.replace(/\.(svg|html?)$/i, "").trim();
        const found = titleOf(source, artifactType);
        const p = await insertPage(id, index, {
          kind: "html", source, artifactType, allowNetwork: false,
          title: found !== "Live page" ? found : fromFile || "Live page",
        });
        blotReact("hop");
        toast(`Added "${f.name}" as a live page`);
        reveal(p.id, "start", 50);
      } catch (e) {
        toast(`Couldn't open "${f.name}": ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (kind === "pdf") {
      const f = await platform.openFile([".pdf", "application/pdf"]);
      if (!f) return;
      setBusyJob({ label: `Importing "${f.name}"`, done: 0, total: 0 });
      try {
        const r = await importPdf(f, {
          notebookId: id,
          at: index,
          onProgress: (done, total) => setBusyJob({ label: `Importing "${f.name}"`, done, total }),
        });
        toast(`Added ${r.pageIds.length} PDF ${r.pageIds.length === 1 ? "page" : "pages"}`);
        blotReact("bounce");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyJob(null);
      }
      return;
    }
    const added = await insertPage(id, index, kind === "ink" ? { kind: "ink", template: "blank" } : { kind: "text" });
    if (bookRef.current) reveal(added.id);
  }

  async function handleDeletePage(p: Page) {
    const snap = await deletePageWithUndo(p.id);
    if (snap) {
      toast("Page deleted", { label: "Undo", run: () => { void restoreDeletedPage(snap); } });
    }
  }

  const currentRef = useRef(current);
  currentRef.current = current;
  const pagesLen = useRef(pages.length);
  pagesLen.current = pages.length;
  const onSmartPaste = useCallback((source: string) => {
    setSheet({ index: Math.min(currentRef.current + 1, pagesLen.current), initial: { source } });
  }, []);
  useSmartPaste(onSmartPaste);

  async function exportPdf(list: Page[], name: string) {
    if (!notebook || list.length === 0) return;
    setBusyJob({ label: `Exporting PDF`, done: 0, total: list.length });
    try {
      const r = await exportPagesPdf(list, notebook, (done, total) => setBusyJob({ label: "Exporting PDF", done, total }));
      const safe = safeName(name);
      await platform.saveFile(`${safe}.pdf`, new Blob([r.bytes as BlobPart], { type: "application/pdf" }));
      toast(`PDF saved (${r.pdfPages} ${r.pdfPages === 1 ? "page" : "pages"})` +
        (r.livesAsCards ? ` - ${r.livesAsCards} live ${r.livesAsCards === 1 ? "page" : "pages"} shown as a card` : ""));
    } catch (e) {
      toast(`PDF export failed: ${String(e)}`);
    } finally {
      setBusyJob(null);
    }
  }

  async function exportJpg(list: Page[], nbForName: Notebook) {
    if (list.length === 0) return;
    setBusyJob({ label: "Exporting JPG images", done: 0, total: list.length });
    try {
      const r = await exportPagesJpg(list, nbForName);
      await platform.saveFile(r.name, r.blob);
      toast("Images saved");
    } catch (e) {
      toast(`JPG export failed: ${String(e)}`);
    } finally {
      setBusyJob(null);
    }
  }

  async function runExport(r: ExportRequest) {
    setExporting(false);
    if (!notebook) return;
    const list = r.indices.map((i) => pages[i]).filter((p): p is Page => !!p);
    if (r.format === "pdf") await exportPdf(list, notebook.title); else await exportJpg(list, notebook);
  }

  async function saveLive(d: LiveDraft) {
    const s = sheet;
    setSheet(null);
    if (!s) return;
    if (s.edit) { await updatePage(s.edit.id, d); return; }
    const p = await insertPage(id, s.index, { kind: "html", ...d });
    blotReact("hop");
    reveal(p.id, "start", 50);
  }

  async function saveChart(spec: ChartSpec, editing?: PageObject) {
    if (!notebook) return;
    try {
      const png = await renderChartPng(spec, notebook.paper);
      if (editing) {
        await updateChart(editing.id, spec, png);
        setChartReq(null);
        toast("Chart updated");
        return;
      }
      const here = pages[current];
      const to = here?.kind === "ink" ? here.id
        : await askPlace({ title: "Put the chart on…", fromPageId: here?.id, allowCurrent: false });
      if (!to) return;
      await addChart(to, spec, png);
      setChartReq(null);
      toast("Chart added. Use the lasso to move or resize it, or to edit its data.");
      if (to !== here?.id) reveal(to);
    } catch (e) {
      toast(`Couldn't draw the chart: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleGenerateTapeCards(targetPage: Page) {
    if (!notebook) return;
    const pageNum = pages.indexOf(targetPage) + 1;
    const { studySet, created } = await generateCardsFromPageTapes(notebook, targetPage, pageNum);
    if (created === 0) {
      toast("Draw Study Tape strips over terms or steps on this page first, then generate flashcards.");
      return;
    }
    toast(`Created ${created} occlusion ${created === 1 ? "flashcard" : "flashcards"}`, {
      label: "Study now",
      run: () => navigate(`/nb/${studySet.id}`),
    });
  }

  async function handleMakeCardFromSelection(targetPage: Page, box: Box) {
    if (!notebook) return;
    const pageNum = pages.indexOf(targetPage) + 1;
    const studySet = await generateCardFromSelection(notebook, targetPage, box, pageNum);
    toast("Added occlusion flashcard to Study Cards", {
      label: "Study now",
      run: () => navigate(`/nb/${studySet.id}`),
    });
  }

  const toggleFitZoom = () => {
    const avail = scroller.current?.clientWidth ? scroller.current.clientWidth - 32 : 0;
    const fit = avail > 120 ? clampZoom(avail / BASE_WIDTH) : 1;
    if (Math.abs(zoom - 1) > 0.03) setZoom(1);
    else if (Math.abs(fit - 1) > 0.03) setZoom(fit);
    else setZoom(1);
  };

  if (notebook === undefined) return <main className="nb-loading dim">Loading...</main>;
  if (notebook === null) {
    return (
      <main className="nb-missing">
        <h2>Notebook not found</h2>
        <p className="dim">This notebook does not exist on this device or may have been deleted.</p>
        <div className="row-end" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => navigate("/")}>Back to library</button>
        </div>
      </main>
    );
  }
  if (notebook.locked) return <UnlockScreen notebook={notebook} />;
  if (notebook.trashedAt) {
    return (
      <main className="nb-trashed">
        <h2>&ldquo;{notebook.title}&rdquo; is in Trash.</h2>
        <p className="dim">Restore it to keep working on it. Items in Trash are deleted after 30 days.</p>
        <div className="row-end" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => navigate("/")}>Back to library</button>
          <button className="btn primary" onClick={() => restoreNotebook(notebook.id)}>Restore</button>
        </div>
      </main>
    );
  }
  const cur = pages[current];
  return (
    <div className="nb-view">
      <Toolbar
        notebook={notebook}
        zoom={zoom}
        setZoom={setZoom}
        onResetZoom={toggleFitZoom}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSettings={onOpenSettings}
        splitOpen={splitOpen}
        onToggleSplit={() => setSplitOpen((v) => !v)}
        bookView={book}
        onToggleBookView={toggleLayout}
        audioOpen={audioOpen}
        onToggleAudio={() => setAudioOpen((v) => !v)}
        onOpenSpeechNote={() => setSpeechNoteOpen(true)}
        onOpenElements={cur?.kind === "ink" ? () => setElementsOpen(true) : undefined}
        onAddChart={() => openChartEditor()}
        onOpenTemplates={cur?.kind === "ink" ? () => setTemplatesFor(cur) : undefined}
        onGenerateTapeCards={cur?.kind === "ink" ? () => void handleGenerateTapeCards(cur) : undefined}
        enableZoomBox
        palette={inkPalette(notebook.paper)}
        currentKind={cur?.kind}
        onExportPdf={() => exportPdf(pages, notebook.title)}
        onExportOptions={() => setExporting(true)}
        onExportBackup={async () => {
          try {
            const blob = await exportBackup(notebook.id);
            await platform.saveFile(`${safeName(notebook.title)}${BACKUP_EXT}`, blob);
            toast("Backup saved");
          } catch (e) { toast(`Backup failed: ${e instanceof Error ? e.message : String(e)}`); }
        }}
        onUndo={() => cur && sendCommand("undo", cur.id)}
        onRedo={() => cur && sendCommand("redo", cur.id)}
      />
      {audioOpen && (
        <AudioBar
          notebookId={notebook.id}
          currentPage={cur}
          onOpenSpeechSettings={() => setSpeechNoteOpen(true)}
          onClose={() => setAudioOpen(false)}
        />
      )}
      {busyJob && (
        <div className="nb-progress" role="status">
          <span>{busyJob.label}</span>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: busyJob.total > 0 ? `${Math.round((busyJob.done / busyJob.total) * 100)}%` : "35%" }} />
          </div>
          {busyJob.total > 0 && <span className="mono dim small">{busyJob.done} / {busyJob.total}</span>}
        </div>
      )}
      <div className={`nb-body ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${splitOpen ? "split-active" : ""}`}>
        {sidebarOpen && (
          <>
            <div className="nb-drawer-backdrop" aria-hidden onClick={() => setSidebarOpen(false)} />
            <Thumbnails pages={pages} bookmarks={notebook.bookmarks} current={current} paper={notebook.paper} onJump={jump}
              onInsert={insert} onReorder={(a, b) => movePage(id, a, b)} />
          </>
        )}
        <div className="nb-scroll" ref={scroller}>
          {pages.length === 0 ? (
            <div className="nb-empty-pages">
              <h2>This notebook has no pages</h2>
              <p className="dim">Add an Ink page, Text page, or paste an AI artifact to create a Live page.</p>
              <div className="empty-actions">
                <button className="btn primary" onClick={() => insert(0, "ink")}><PenLine size={15} strokeWidth={1.5} />Add ink page</button>
                <button className="btn" onClick={() => insert(0, "text")}><FileText size={15} strokeWidth={1.5} />Add text page</button>
                <button className="btn" onClick={() => insert(0, "live")}><Sparkles size={15} strokeWidth={1.5} color="var(--live)" />Add live page</button>
              </div>
            </div>
          ) : (
            <div className={`nb-column ${book ? "is-book" : ""}`} ref={column} style={{ width }}>
              {(() => {
                const list = (
              <PageList
                only={book ? bookIndex : undefined}
                pages={pages}
                notebook={notebook}
                mounted={mounted}
                width={width}
                renderPage={(p, i, m, w) => (
                  <PageFrame
                    page={p}
                    notebook={notebook}
                    mounted={m}
                    width={w}
                    priority={1000 - Math.abs(i - current)}
                    onMakeCardFromBox={(pg, box) => void handleMakeCardFromSelection(pg, box)}
                    onEditLive={(pg) => pg.kind === "html" && setSheet({ index: i, edit: pg, initial: { title: pg.title, source: pg.source, artifactType: pg.artifactType, allowNetwork: pg.allowNetwork } })}
                  />
                )}
                onDuplicate={(p) => duplicatePage(p.id)}
                onDelete={handleDeletePage}
                onMovePage={(from, to) => movePage(id, from, to)}
                onPaste={(p) => { if (p.kind === "ink") void pasteClipboard(p.id); }}
                onExportPage={(p) => exportPdf([p], `${notebook.title} - page ${pages.indexOf(p) + 1}`)}
                onRotate={(p) => rotatePage(p.id)}
                onLayers={(p) => setLayersFor(p.id)}
                onTapeAll={(p, on) => setAllTape(p.id, on)}
                onExportPageJpg={(p) => exportJpg([p], { ...notebook, title: `${notebook.title} - page ${pages.indexOf(p) + 1}` })}
                onBookmark={(p) => toggleBookmark(id, p.id)}
                onTemplate={(p, t) => void setStemTemplateForPage(p.id, t, updatePage)}
                onOpenStemTemplates={(p) => setTemplatesFor(p)}
                onReadHandwriting={(p) => {
                  toast("Reading the handwriting on this page...");
                  void indexHandwriting(p.id).then((t) => toast(t ? "Handwriting on this page is now searchable" : "No handwriting found on this page"))
                    .catch((e) => toast(e instanceof Error ? e.message : String(e)));
                }}
              />
                );
                return book ? (
                  <BookView pageKey={pages[bookIndex]?.id ?? "none"} index={bookIndex} count={pages.length} dir={turnDir}
                    onTurn={turnPage} onAddPage={() => setAddAt(bookIndex + 1)} scroller={scroller}>
                    {list}
                  </BookView>
                ) : list;
              })()}
              {!book && (
                <button type="button" className="nb-add-page" onClick={() => setAddAt(pages.length)}>
                  <Plus size={16} strokeWidth={1.5} />Add page
                </button>
              )}
            </div>
          )}
        </div>
        {splitOpen && (
          <SplitCompanionPane primaryNotebookId={notebook.id} onClose={() => setSplitOpen(false)} />
        )}
        {!sidebarOpen && pages.length > 0 && !book && (
          <button type="button" className="nb-page-pill mono" onClick={() => setSidebarOpen(true)} title="Show pages sidebar">
            {current + 1} / {pages.length}
          </button>
        )}
      </div>
      {tool.zoomBoxOpen && cur?.kind === "ink" && (
        <ZoomWritingWindow page={cur} notebook={notebook} onClose={() => setTool({ zoomBoxOpen: false })} />
      )}
      <ElementsSheet
        open={elementsOpen}
        onClose={() => setElementsOpen(false)}
        paper={notebook.paper}
        onInsert={(elem) => {
          if (cur?.kind === "ink") sendStampElement(cur.id, elem);
        }}
      />
      <TemplatesSheet
        open={!!templatesFor}
        onClose={() => setTemplatesFor(null)}
        current={templatesFor ? getEffectiveTemplate(templatesFor) : "blank"}
        paper={notebook.paper}
        onSelect={(tpl) => {
          if (templatesFor) void setStemTemplateForPage(templatesFor.id, tpl, updatePage);
        }}
      />
      <ExportSheet open={exporting} onClose={() => setExporting(false)} total={pages.length} current={current} onExport={runExport} />
      <SpeechNoteModal
        open={speechNoteOpen}
        onClose={() => setSpeechNoteOpen(false)}
        notebookId={notebook.id}
        currentPage={cur}
      />
      <PasteSheet open={!!sheet} initial={sheet?.initial} onClose={() => setSheet(null)} onSave={saveLive} />
      <LayersSheet page={(pages.find((p) => p.id === layersFor && p.kind === "ink") as InkPage | undefined) ?? null} onClose={() => setLayersFor(null)} />
      <InsertMenu open={addAt !== null} position={addAt !== null ? addAt + 1 : undefined}
        onClose={() => setAddAt(null)} onPick={(k) => { if (addAt !== null) void insert(addAt, k); }} />
      <RecognizeSheet request={recog} onClose={() => setRecog(null)} />
      <ChartSheet request={chartReq} paper={notebook.paper} onClose={() => setChartReq(null)} onSave={saveChart} />
      <PlaceHost notebookId={notebook.id} pages={pages} current={current} />
      {clipVersion > 0 && clipSize > 0 && !pasteHidden && (
        <div className="paste-bar" role="region" aria-label="Paste">
          <span className="dim">{clipSize} {clipSize === 1 ? "item" : "items"} copied</span>
          {cur?.kind === "ink" && <button className="btn primary" onClick={() => void pasteTo(cur.id)}>Paste on page {current + 1}</button>}
          <button className="btn" onClick={() => void askPlace({ title: "Paste on…", allowCurrent: true }).then((to) => { if (to) void pasteTo(to); })}>Paste on…</button>
          <button className="btn ghost icon" aria-label="Hide paste bar" onClick={() => setPasteHidden(true)}><X size={14} strokeWidth={1.5} /></button>
        </div>
      )}
      <RulerOverlay />
      {new URLSearchParams(window.location.search).get("debug") === "latency" && <LatencyOverlay />}
      {new URLSearchParams(window.location.search).get("debug") === "palm" && <PalmOverlay />}
    </div>
  );
}
