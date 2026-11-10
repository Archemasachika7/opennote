"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Focus, Map as MapIcon, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { InkPage, Notebook, Page, PageObject, Template } from "../store/schema";
import { getNotebook, restoreNotebook } from "../store/notebooks";
import { deletePage, getPages, insertBoard, movePage, updatePage } from "../store/pages";
import { useLive } from "../store/useLive";
import { navigate } from "../App";
import { Toolbar } from "../notebook/Toolbar";
import { ExportSheet, type ExportRequest } from "../notebook/ExportSheet";
import { safeName } from "../notebook/NotebookView";
import { sendCommand, setTool, useTool } from "../notebook/tool";
import { InkLayer } from "../ink/InkLayer";
import { ObjectLayer } from "../ink/ObjectLayer";
import { TapeLayer } from "../ink/TapeLayer";
import { LayersSheet } from "../ink/LayersSheet";
import { RulerOverlay } from "../ink/RulerOverlay";
import { addImage, getObjects, setAllTape } from "../ink/objects";
import { CLIP_MARKER, hasClipboard, pasteClipboard } from "../ink/clipboard";
import { inkPalette, resolveColor } from "../ink/render";
import { BASE_LAYER, getActiveLayer, hiddenLayers, useActiveLayerVersion } from "../ink/layers";
import { getStrokes } from "../store/strokes";
import { exportPagesPdf } from "../io/exportPdf";
import { exportPagesJpg } from "../io/exportImages";
import { BACKUP_EXT, exportBackup } from "../io/backup";
import { platform } from "../platform/port";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { Minimap } from "./Minimap";
import { clampBoardZoom, contentBounds, panBy, zoomAt, type View } from "./viewport";
import "./board.css";

const I = { size: 15, strokeWidth: 1.5 } as const;
const GRID = 52;
export const BOARD_COLORS: Record<Notebook["paper"], string[]> = {
  dark: ["#1E2028", "#121318", "#1B2421", "#262019"],
  light: ["#F3F1EC", "#FFFFFF", "#EEF3EF", "#F8F0E3"],
};
const RULE = { dark: "#2A2D37", light: "#D6D2C8" };
const DEFAULT_VIEW: View = { x: -80, y: -60, zoom: 1 };

/* ---- per-board view, remembered for this device ---- */
const views = new Map<string, View>();
function loadView(id: string): View {
  const v = views.get(id);
  if (v) return v;
  try {
    const raw = JSON.parse(localStorage.getItem(`opennote:board-view:${id}`) ?? "null") as View | null;
    if (raw && [raw.x, raw.y, raw.zoom].every((n) => typeof n === "number" && Number.isFinite(n))) return { ...raw, zoom: clampBoardZoom(raw.zoom) };
  } catch { /* storage unavailable */ }
  return DEFAULT_VIEW;
}
function saveView(id: string, v: View): void {
  views.set(id, v);
  try { localStorage.setItem(`opennote:board-view:${id}`, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { if (el.clientWidth && el.clientHeight) setSize({ w: el.clientWidth, h: el.clientHeight }); };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** A whiteboard: a list of boards, each an infinite canvas with pan, zoom and a minimap. */
export function WhiteboardView({ id, pageId }: { id: string; pageId?: string }) {
  const notebook = useLive(() => getNotebook(id), [id], undefined as Notebook | undefined);
  const pages = useLive(() => getPages(id), [id], null as Page[] | null);
  const boards = (pages ?? []).filter((p): p is InkPage => p.kind === "ink");
  const [currentId, setCurrentId] = useState<string | undefined>(pageId);
  const board = boards.find((b) => b.id === currentId) ?? boards[0];
  const [exporting, setExporting] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [showMap, setShowMap] = useState(true);

  if (!notebook) return <main className="nb-loading dim">Loading...</main>;
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

  async function runExport(r: ExportRequest) {
    setExporting(false);
    if (!notebook) return;
    const list = r.indices.map((i) => boards[i]).filter((p): p is InkPage => !!p);
    if (list.length === 0) return;
    try {
      if (r.format === "pdf") {
        toast(`Exporting ${list.length} ${list.length === 1 ? "board" : "boards"} to PDF...`);
        const out = await exportPagesPdf(list, notebook);
        await platform.saveFile(`${safeName(notebook.title)}.pdf`, new Blob([out.bytes as BlobPart], { type: "application/pdf" }));
        toast("PDF saved");
      } else {
        const out = await exportPagesJpg(list, notebook);
        await platform.saveFile(out.name, out.blob);
        toast("Images saved");
      }
    } catch (e) { toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div className="nb-view wb-view" data-testid="whiteboard">
      <BoardChrome notebook={notebook} board={board} onExportOptions={() => setExporting(true)}
        onExportPdf={() => runExport({ format: "pdf", indices: boards.map((_, i) => i) } as ExportRequest)} />
      <div className="nb-body">
        <BoardList boards={boards} current={board?.id} onSelect={setCurrentId} notebookId={id}
          onLayers={() => setLayersOpen(true)} />
        {board ? (
          <BoardStage key={board.id} board={board} notebook={notebook} showMap={showMap} onToggleMap={() => setShowMap((s) => !s)} />
        ) : <div className="wb-empty dim">{pages ? "No boards. Add one on the left." : "Loading..."}</div>}
      </div>
      <ExportSheet open={exporting} onClose={() => setExporting(false)} total={boards.length}
        current={Math.max(0, boards.findIndex((b) => b.id === board?.id))} onExport={runExport} />
      <LayersSheet page={layersOpen && board ? board : null} onClose={() => setLayersOpen(false)} />
      <RulerOverlay />
    </div>
  );
}

/** The toolbar for the current board (zoom lives in the stage, so the toolbar reads it from there). */
function BoardChrome({ notebook, board, onExportPdf, onExportOptions }: {
  notebook: Notebook; board?: InkPage; onExportPdf: () => void; onExportOptions: () => void;
}) {
  const [zoom, setZoomState] = useState(() => (board ? loadView(board.id).zoom : 1));
  useEffect(() => {
    const on = (e: Event) => setZoomState((e as CustomEvent<number>).detail);
    window.addEventListener("opennote:board-zoom", on);
    return () => window.removeEventListener("opennote:board-zoom", on);
  }, []);
  return (
    <Toolbar notebook={notebook} zoom={zoom} palette={inkPalette(notebook.paper)} currentKind="ink"
      setZoom={(z) => window.dispatchEvent(new CustomEvent("opennote:board-set-zoom", { detail: z }))}
      onExportPdf={onExportPdf} onExportOptions={onExportOptions}
      onExportBackup={async () => {
        try {
          await platform.saveFile(`${safeName(notebook.title)}${BACKUP_EXT}`, await exportBackup(notebook.id));
          toast("Backup saved");
        } catch (e) { toast(`Backup failed: ${e instanceof Error ? e.message : String(e)}`); }
      }}
      onUndo={() => board && sendCommand("undo", board.id)} onRedo={() => board && sendCommand("redo", board.id)} />
  );
}

function BoardList({ boards, current, onSelect, notebookId, onLayers }: {
  boards: InkPage[]; current?: string; onSelect: (id: string) => void; notebookId: string; onLayers: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <aside className="thumbs wb-boards" aria-label="Boards">
      <ol>
        {boards.map((b, i) => (
          <li key={b.id} className={b.id === current ? "on" : ""}>
            {renaming === b.id ? (
              <input className="input" aria-label="Board name" autoFocus defaultValue={b.title ?? `Board ${i + 1}`}
                onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v) void updatePage(b.id, { title: v }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
            ) : (
              <button className="wb-board" aria-current={b.id === current ? "true" : undefined} aria-label={b.title ?? `Board ${i + 1}`}
                title="Double-click to rename"
                onClick={() => onSelect(b.id)} onDoubleClick={() => setRenaming(b.id)}>
                <span className="mono dim">{i + 1}</span>{b.title ?? `Board ${i + 1}`}
              </button>
            )}
            <div style={{ position: "relative" }}>
              <button className="btn ghost icon" aria-label={`Options for ${b.title ?? `Board ${i + 1}`}`} onClick={() => setMenuFor(b.id)}>
                <MoreHorizontal {...I} /></button>
              {menuFor === b.id && (
                <Menu onClose={() => setMenuFor(null)} style={{ left: 0, top: 30 }} items={[
                  { label: "Rename", icon: <Pencil size={14} strokeWidth={1.5} />, onSelect: () => setRenaming(b.id) },
                  { label: "Layers...", onSelect: () => { onSelect(b.id); onLayers(); } },
                  { label: "Reveal all tape", onSelect: () => setAllTape(b.id, true) },
                  { label: "Cover all tape", onSelect: () => setAllTape(b.id, false) },
                  ...(i > 0 ? [{ label: "Move up", icon: <ArrowUp size={14} strokeWidth={1.5} />, onSelect: () => movePage(notebookId, i, i - 1) }] : []),
                  ...(i < boards.length - 1 ? [{ label: "Move down", icon: <ArrowDown size={14} strokeWidth={1.5} />, onSelect: () => movePage(notebookId, i, i + 1) }] : []),
                  ...(boards.length > 1 ? [{ label: "Delete board", icon: <Trash2 size={14} strokeWidth={1.5} />, danger: true, onSelect: () => deletePage(b.id) }] : []),
                ]} />
              )}
            </div>
          </li>
        ))}
      </ol>
      <button className="btn wb-add" onClick={async () => { const p = await insertBoard(notebookId); onSelect(p.id); }}>
        <Plus {...I} />Add board</button>
    </aside>
  );
}

function BoardStage({ board, notebook, showMap, onToggleMap }: { board: InkPage; notebook: Notebook; showMap: boolean; onToggleMap: () => void }) {
  const [tool] = useTool();
  useActiveLayerVersion();
  const stage = useRef<HTMLDivElement>(null);
  const size = useElementSize(stage);
  const [view, setViewRaw] = useState<View>(() => loadView(board.id));
  const viewRef = useRef(view);
  viewRef.current = view;
  const setView = useCallback((f: View | ((v: View) => View)) => {
    setViewRaw((v) => {
      const n = typeof f === "function" ? f(v) : f;
      saveView(board.id, n);
      return n;
    });
  }, [board.id]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("opennote:board-zoom", { detail: view.zoom })); }, [view.zoom]);

  // toolbar zoom buttons: zoom about the centre of the stage
  useEffect(() => {
    const on = (e: Event) => setView((v) => zoomAt(v, (e as CustomEvent<number>).detail, size.w / 2, size.h / 2));
    window.addEventListener("opennote:board-set-zoom", on);
    return () => window.removeEventListener("opennote:board-set-zoom", on);
  }, [setView, size.w, size.h]);

  // wheel pans; Ctrl/Cmd+wheel (and trackpad pinch) zooms at the cursor
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, v.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top));
      else setView((v) => panBy(v, -e.deltaX, -e.deltaY));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [setView]);

  // two-finger pinch / pan on touch screens
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let last: { d: number; mx: number; my: number } | null = null;
    const measure = () => {
      const [a, b] = [...touches.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) last = measure();
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || !last) return;
      const m = measure();
      const r = el.getBoundingClientRect();
      const prev = last;
      last = m;
      setView((v) => zoomAt(panBy(v, m.mx - prev.mx, m.my - prev.my), v.zoom * (m.d / (prev.d || 1)), m.mx - r.left, m.my - r.top));
    };
    const up = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) last = null; };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
    };
  }, [setView]);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      sendCommand(e.shiftKey ? "redo" : "undo", board.id);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [board.id]);

  // where new pictures go: the middle of what is on screen
  const centre = useCallback(() => {
    const v = viewRef.current;
    return { x: v.x + size.w / 2 / v.zoom - 200, y: v.y + size.h / 2 / v.zoom - 150 };
  }, [size.w, size.h]);

  // the image tool is a one-shot action: pick pictures, then go back to the previous tool
  const lastTool = useRef(tool.tool);
  useEffect(() => {
    if (tool.tool !== "image") { lastTool.current = tool.tool; return; }
    setTool({ tool: lastTool.current });
    void platform.openFiles(["image/*"]).then(async (files) => {
      for (const [i, f] of files.entries()) { const c = centre(); await addImage(board.id, f, { x: c.x + i * 32, y: c.y + i * 32 }); }
    });
  }, [tool.tool]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (hasClipboard() && (text === CLIP_MARKER || text === "")) { e.preventDefault(); void pasteClipboard(board.id); return; }
      const files = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void (async () => { for (const [i, f] of files.entries()) { const c = centre(); await addImage(board.id, f, { x: c.x + i * 32, y: c.y + i * 32 }); } })();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [board.id, centre]);

  const stored = useLive(() => getObjects(board.id), [board.id], [] as PageObject[]);
  const [preview, setPreview] = useState<PageObject[] | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const objects = preview ? stored.map((o) => preview.find((p) => p.id === o.id) ?? o) : stored;
  const hidden = useMemo(() => hiddenLayers(board), [board]);
  const active = getActiveLayer(board.id, board);
  const paper = notebook.paper;
  const textColor = resolveColor({ color: tool.color, paletteIndex: tool.paletteIndex ?? undefined }, paper);

  const fit = async () => {
    const strokes = await getStrokes(board.id);
    const b = contentBounds(strokes, await getObjects(board.id));
    if (!b) { setView(DEFAULT_VIEW); return; }
    const zoom = clampBoardZoom(Math.min(size.w / (b.w + 120), size.h / (b.h + 120)));
    setView({ zoom, x: b.x + b.w / 2 - size.w / 2 / zoom, y: b.y + b.h / 2 - size.h / 2 / zoom });
  };

  const step = GRID * view.zoom;
  const pattern = board.template === "grid" || board.template === "dot" ? board.template : "blank";
  const rule = RULE[paper];
  const bgImage = step < 8 || pattern === "blank" ? "none"
    : pattern === "dot" ? `radial-gradient(circle, ${rule} ${Math.max(1, 1.8 * view.zoom)}px, transparent ${Math.max(1.2, 2.1 * view.zoom)}px)`
    : `linear-gradient(${rule} 1px, transparent 1px), linear-gradient(90deg, ${rule} 1px, transparent 1px)`;
  const bgPos = `${-view.x * view.zoom - (pattern === "dot" ? step / 2 : 0)}px ${-view.y * view.zoom - (pattern === "dot" ? step / 2 : 0)}px`;

  return (
    <div className="wb-stage" ref={stage} data-testid="board-stage"
      style={{ backgroundColor: board.bgColor ?? BOARD_COLORS[paper][0], backgroundImage: bgImage, backgroundSize: `${step}px ${step}px`, backgroundPosition: bgPos }}>
      <ObjectLayer pageId={board.id} objects={objects} scale={view.zoom} origin={view} tool={tool.tool} textColor={textColor}
        cropping={cropping} setCropping={setCropping} hidden={hidden} layerId={active === BASE_LAYER ? undefined : active} />
      <InkLayer pageId={board.id} width={size.w} height={size.h} paper={paper} view={view} layers={board.layers} tapeEnabled
        onPan={(dx, dy) => setView((v) => panBy(v, dx, dy))}
        objects={stored.filter((o) => !hidden.has(o.layerId ?? BASE_LAYER))} onPreviewObjects={setPreview} onCropRequest={setCropping}
        disabled={tool.tool === "text" || tool.tool === "image" || cropping !== null} />
      <TapeLayer objects={objects} scale={view.zoom} origin={view} tool={tool.tool} hidden={hidden} />

      <div className="wb-panel" onPointerDown={(e) => e.stopPropagation()}>
        <select className="input" aria-label="Background pattern" value={pattern}
          onChange={(e) => updatePage(board.id, { template: e.target.value as Template })}>
          <option value="blank">Blank</option><option value="dot">Dots</option><option value="grid">Grid</option>
        </select>
        <div className="swatches" role="group" aria-label="Background colour">
          {BOARD_COLORS[paper].map((c, i) => (
            <button key={c} className={`swatch ${(board.bgColor ?? BOARD_COLORS[paper][0]) === c ? "on" : ""}`} style={{ background: c }}
              aria-label={`Background ${i + 1}`} onClick={() => updatePage(board.id, { bgColor: c })} />
          ))}
        </div>
      </div>

      <div className="wb-corner" onPointerDown={(e) => e.stopPropagation()}>
        <div className="wb-corner-bar">
          <button className="btn ghost icon" aria-label="Fit board to screen" title="Show everything on this board" onClick={fit}><Focus {...I} /></button>
          <button className={`btn ghost icon ${showMap ? "active" : ""}`} aria-label="Minimap" aria-pressed={showMap} onClick={onToggleMap}><MapIcon {...I} /></button>
        </div>
        {showMap && <Minimap pageId={board.id} paper={paper} view={view} size={size} layers={board.layers} onView={setView} />}
      </div>
    </div>
  );
}
