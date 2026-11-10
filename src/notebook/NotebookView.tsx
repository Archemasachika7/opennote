import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, PenLine, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { HtmlPage, InkPage, Notebook, Page } from "../store/schema";
import { getNotebook, listNotebooks, restoreNotebook, toggleBookmark } from "../store/notebooks";
import { navigate } from "../App";
import { deletePageWithUndo, duplicatePage, getPages, insertPage, movePage, restoreDeletedPage, updatePage } from "../store/pages";
import { useLive } from "../store/useLive";
import { Toolbar } from "./Toolbar";
import { Thumbnails } from "./Thumbnails";
import { PageList } from "./PageList";
import { PageFrame } from "./PageFrame";
import { useVisiblePages } from "./useVisiblePages";
import { usePinchZoom } from "./usePinchZoom";
import { useStudioShortcuts } from "./useStudioShortcuts";
import { sendCommand, sendStampElement, setTool, useTool } from "./tool";
import { addImage, pasteImages, setAllTape } from "../ink/objects";
import { resolveImageTarget } from "./imageTarget";
import { CLIP_MARKER, hasClipboard, pasteClipboard } from "../ink/clipboard";
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
import type { InsertKind } from "./InsertMenu";
import { inkPalette } from "../ink/render";
import { LatencyOverlay } from "../dev/LatencyOverlay";
import { TemplatesSheet } from "./TemplatesSheet";
import { getEffectiveTemplate, hydratePageTemplates, setStemTemplateForPage } from "../store/templates";
import { AudioBar } from "./AudioBar";
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
  const { mounted, current } = useVisiblePages(scroller, pages.length);
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
  const width = BASE_WIDTH * zoom;
  usePinchZoom(scroller, setZoomRaw, clampZoom);

  useEffect(() => { void hydratePageTemplates(); }, []);

  const jump = useCallback((i: number) => {
    const p = pages[i];
    if (p) document.getElementById(`page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (initialMobile()) setSidebarOpen(false);
  }, [pages]);

  const hasPages = pages.length > 0;
  useEffect(() => {
    if (!pageId || !hasPages) return;
    const i = pages.findIndex((p) => p.id === pageId);
    if (i >= 0) jump(i);
  }, [pageId, hasPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const curPage = pages[current];
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
    void platform.openFiles(["image/*"]).then(async (files) => {
      if (files.length === 0) return;
      const targetPageId = await resolveImageTarget(id, snapshot.pages, snapshot.current);
      for (const f of files) await addImage(targetPageId, f);
    });
  }, [tool.tool]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (hasClipboard() && (text === CLIP_MARKER || text === "")) {
        e.preventDefault();
        void resolveImageTarget(id, pages, current).then((targetId) => pasteClipboard(targetId));
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void resolveImageTarget(id, pages, current).then((targetId) => pasteImages(files, targetId));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [id, pages, current]);

  async function insert(index: number, kind: InsertKind) {
    if (kind === "live") { setSheet({ index }); return; }
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
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyJob(null);
      }
      return;
    }
    await insertPage(id, index, kind === "ink" ? { kind: "ink", template: "blank" } : { kind: "text" });
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
    setTimeout(() => document.getElementById(`page-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
        audioOpen={audioOpen}
        onToggleAudio={() => setAudioOpen((v) => !v)}
        onOpenSpeechNote={() => setSpeechNoteOpen(true)}
        onOpenElements={cur?.kind === "ink" ? () => setElementsOpen(true) : undefined}
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
            <div className="nb-column" style={{ width }}>
              <PageList
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
              />
            </div>
          )}
        </div>
        {splitOpen && (
          <SplitCompanionPane primaryNotebookId={notebook.id} onClose={() => setSplitOpen(false)} />
        )}
        {!sidebarOpen && pages.length > 0 && (
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
      <RulerOverlay />
      {new URLSearchParams(window.location.search).get("debug") === "latency" && <LatencyOverlay />}
    </div>
  );
}
