"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springs } from "../ui/motion";
import {
  ArrowLeft, AudioLines, BookOpen, ChartColumn, ChevronLeft, ChevronRight, Columns2, Eraser, GraduationCap, Hand, Highlighter, Image as ImageIcon, Lasso, LayoutGrid, LayoutTemplate,
  Maximize2, Mic, Minus, MoreHorizontal, MousePointer2, PaintBucket, PanelLeft, PenLine,
  RectangleHorizontal, Redo2, Ruler as RulerIcon, Settings, Shapes, Sparkles, Stamp, Type, Undo2, ZoomIn, ZoomOut, LocateFixed,
} from "lucide-react";
import { useRuler } from "../ink/ruler";
import { toggleRuler } from "../ink/RulerOverlay";
import { navigate } from "../App";
import type { Notebook } from "../store/schema";
import { COVERS, renameNotebook, updateNotebook } from "../store/notebooks";
import { useAudioLiveState } from "../store/audio";
import { Menu, type MenuItem } from "../ui/Menu";
import { sendShapeStylePatch, useTool, type ToolName, type ToolState } from "./tool";
import { SHAPES } from "../ink/shapes";
import type { PenVariant } from "../ink/model";
import { PenPresets } from "./PenPresets";

const ICON = { size: 16, strokeWidth: 1.5 } as const;
export const DEFAULT_COLORS = ["#E8E9EE", "#4FD1C5", "#3DDC97", "#FF8A5B", "#5BB8FF", "#F2C94C", "#FF6B6B", "#9A9DAB"];

export function Toolbar({
  notebook, zoom, setZoom, onResetZoom, onUndo, onRedo, palette = DEFAULT_COLORS, currentKind,
  sidebarOpen, onToggleSidebar, onOpenSettings,
  splitOpen, onToggleSplit,
  bookView, onToggleBookView,
  onAddChart, onNotebookAi,
  audioOpen, onToggleAudio,
  onOpenSpeechNote,
  onOpenElements, onOpenTemplates, onGenerateTapeCards,
  enableZoomBox = false,
  onExportPdf, onExportBackup, onExportOptions,
}: {
  notebook: Notebook;
  zoom: number;
  setZoom: (z: number) => void;
  onResetZoom?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  palette?: string[];
  currentKind?: "ink" | "text" | "html";
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  splitOpen?: boolean;
  onToggleSplit?: () => void;
  /** one page at a time with page turns */
  bookView?: boolean;
  onToggleBookView?: () => void;
  onAddChart?: () => void;
  /** Gemini over the whole notebook */
  onNotebookAi?: (task: "summary" | "cards") => void;
  audioOpen?: boolean;
  onToggleAudio?: () => void;
  onOpenSpeechNote?: () => void;
  onOpenElements?: () => void;
  onOpenTemplates?: () => void;
  onGenerateTapeCards?: () => void;
  enableZoomBox?: boolean;
  onExportPdf?: () => void;
  onExportBackup?: () => void;
  onExportOptions?: () => void;
}) {
  const [t, set] = useTool();
  const ruler = useRuler();
  const audioLive = useAudioLiveState();
  const [menu, setMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(notebook.title);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(notebook.title);
  }, [notebook.title, editingTitle]);

  useEffect(() => {
    if (t.paletteIndex !== null && palette[t.paletteIndex] !== t.color) set({ color: palette[t.paletteIndex] });
  }, [palette, t.paletteIndex, t.color, set]);

  useEffect(() => {
    if (t.shapeFillPaletteIndex !== null && palette[t.shapeFillPaletteIndex] && palette[t.shapeFillPaletteIndex] !== t.shapeFillColor) {
      set({ shapeFillColor: palette[t.shapeFillPaletteIndex] });
    }
  }, [palette, t.shapeFillPaletteIndex, t.shapeFillColor, set]);

  const tools: { name: ToolName; label: string; hint: string; icon: JSX.Element }[] = [
    { name: "pen", label: "Pen", hint: "Pen (draw; hold still 0.4s to snap shape, scribble to erase) [P]", icon: <PenLine {...ICON} /> },
    { name: "highlighter", label: "Highlighter", hint: "Highlighter (hold still to snap straight/shape) [H]", icon: <Highlighter {...ICON} /> },
    { name: "eraser", label: "Eraser", hint: "Eraser [E]", icon: <Eraser {...ICON} /> },
    { name: "lasso", label: "Lasso", hint: "Lasso (select, move, save element or make flashcard) [L]", icon: <Lasso {...ICON} /> },
    { name: "shape", label: "Shapes", hint: "Shapes (crisp vector lines, arrows & geometry) [S]", icon: <Shapes {...ICON} /> },
    { name: "tape", label: "Tape", hint: "Tape (drag over notes to hide them; tap a strip with Tape or Hand to reveal) [B]", icon: <RectangleHorizontal {...ICON} /> },
    { name: "laser", label: "Laser pointer", hint: "Laser pointer (a fading red trail for presenting, never saved) [K]", icon: <LocateFixed {...ICON} color="#FF1F3D" /> },
    { name: "text", label: "Text box", hint: "Text box (click on the page) [T]", icon: <Type {...ICON} /> },
    { name: "image", label: "Image", hint: "Insert a picture or video", icon: <ImageIcon {...ICON} /> },
    { name: "hand", label: "Hand", hint: "Hand (scroll, or hold Space) [V]", icon: <Hand {...ICON} /> },
  ];

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== notebook.title) void renameNotebook(notebook.id, trimmed);
    else setTitleDraft(notebook.title);
  };

  const coverFooter = (
    <div className="cover-picker" role="group" aria-label="Cover colour">
      <span className="cover-picker-label dim">Cover</span>
      <div className="cover-swatches">
        {COVERS.map((c) => (
          <button key={c} type="button" className={`swatch ${notebook.coverColor === c ? "on" : ""}`} style={{ background: c }}
            aria-label={`Cover ${c}`} onClick={() => { void updateNotebook(notebook.id, { coverColor: c }); setMenu(false); }} />
        ))}
      </div>
    </div>
  );

  const isRecordingHere = Boolean(audioLive.recording && audioLive.recording.notebookId === notebook.id);

  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems: MenuItem[] = [
    ...(onAddChart ? [{ label: "Add chart", icon: <ChartColumn {...ICON} />, onSelect: onAddChart }] : []),
    ...(onOpenElements ? [{ label: "Elements & stamps", icon: <Stamp {...ICON} />, onSelect: onOpenElements }] : []),
    ...(enableZoomBox && currentKind === "ink"
      ? [{ label: "Zoom writing window", icon: <Maximize2 {...ICON} />, checked: !!t.zoomBoxOpen, onSelect: () => set({ zoomBoxOpen: !t.zoomBoxOpen }) }]
      : []),
    ...(onOpenSpeechNote ? [{ label: "Speech-to-text note", icon: <AudioLines {...ICON} />, onSelect: onOpenSpeechNote }] : []),
    ...(onToggleSplit ? [{ label: "Split screen", icon: <Columns2 {...ICON} />, checked: !!splitOpen, onSelect: onToggleSplit }] : []),
    ...(onToggleBookView ? [{ label: "Book view", icon: <BookOpen {...ICON} />, checked: !!bookView, onSelect: onToggleBookView }] : []),
  ];
  // the button lights up while something from the menu is switched on, so it is never hidden state
  const moreOn = Boolean(splitOpen || bookView || (enableZoomBox && t.zoomBoxOpen));

  // On phones and small tablets the tools row scrolls sideways. Show an arrow at each end that has
  // more tools past it, so the row never looks like it simply ends. (On desktop the row wraps and
  // the strip is `display: contents`, so there is nothing to scroll and no arrows.)
  const reduceMotion = useReducedMotion() ?? false;
  const strip = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measureEdges = useRef(() => {});
  measureEdges.current = () => {
    const el = strip.current;
    if (!el) return;
    const scrolls = getComputedStyle(el).display !== "contents";
    const left = scrolls && el.scrollLeft > 4;
    const right = scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };
  useEffect(() => {
    const el = strip.current;
    const measure = () => measureEdges.current();
    measure();
    el?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el?.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, []);
  // the row's contents change with the tool (shape and eraser options appear), so measure again
  useEffect(() => { measureEdges.current(); }, [t.tool]);
  const scrollStrip = (dir: 1 | -1) => {
    const el = strip.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: reduceMotion ? "auto" : "smooth" });
  };
  const edgeButton = (side: "left" | "right") => (
    <motion.button key={side} type="button" className={`nb-tb-edge ${side}`} tabIndex={-1}
      aria-label={side === "left" ? "Scroll tools left" : "Scroll tools right"}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
      onClick={() => scrollStrip(side === "left" ? -1 : 1)}>
      {side === "left" ? <ChevronLeft {...ICON} /> : <ChevronRight {...ICON} />}
    </motion.button>
  );

  return (
    <header className="nb-toolbar">
      <button className="btn ghost icon" aria-label="Back to library" title="Back to library" onClick={() => navigate("/")}><ArrowLeft {...ICON} /></button>
      {onToggleSidebar && (
        <button className={`btn ghost icon ${sidebarOpen ? "active" : ""}`} aria-label="Toggle sidebar" aria-pressed={sidebarOpen}
          title="Toggle sidebar (Ctrl+\)" onClick={onToggleSidebar}>
          <PanelLeft {...ICON} />
        </button>
      )}
      {editingTitle ? (
        <input
          className="input nb-name-input"
          aria-label="Document title"
          autoFocus
          value={titleDraft}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { e.preventDefault(); setTitleDraft(notebook.title); setEditingTitle(false); }
          }}
        />
      ) : (
        <span
          className="nb-name"
          role="button"
          tabIndex={0}
          title="Click to rename"
          onClick={() => { setTitleDraft(notebook.title); setEditingTitle(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "F2") {
              e.preventDefault();
              setTitleDraft(notebook.title);
              setEditingTitle(true);
            }
          }}>
          {notebook.title}
        </span>
      )}
      {/* on phones this strip becomes its own sideways-scrolling row under the fixed top row */}
      <div className="nb-tb-strip" ref={strip}>
      <AnimatePresence initial={false}>{edges.left && edgeButton("left")}</AnimatePresence>
      <div className="tool-group" role="toolbar" aria-label="Tools">
        {tools.map((x) => (
          <button key={x.name} className={`btn ghost icon ${t.tool === x.name ? "active" : ""}`} aria-label={x.label} title={x.hint}
            aria-pressed={t.tool === x.name} onClick={() => set({ tool: x.name })}>{x.icon}</button>
        ))}
      </div>
      {t.tool === "pen" && (
        <select className="input" aria-label="Pen type" value={t.variant} onChange={(e) => set({ variant: e.target.value as PenVariant })}>
          <option value="ball">Ballpoint</option><option value="fountain">Fountain</option><option value="brush">Brush</option>
          <option value="pencil">Pencil</option><option value="calligraphy">Calligraphy</option><option value="marker">Marker</option>
          <option value="beautify">Beautify</option><option value="inkbrush">Ink brush</option>
          <option value="oblique">Oblique nib</option><option value="rainbow">Rainbow</option>
        </select>
      )}
      <PenPresets paper={notebook.paper} />
      {t.tool === "shape" && (
        <>
          <select className="input" aria-label="Shape" title="Drag on the page to draw. Hold Shift for perfect squares, circles and 15-degree lines. Auto: draw by hand and hold still to snap."
            value={t.shapeKind} onChange={(e) => set({ shapeKind: e.target.value as ToolState["shapeKind"] })}>
            <option value="auto">Auto (hold to snap)</option>
            {SHAPES.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
          </select>
          <div className="shape-fill-group" role="group" aria-label="Shape fill controls">
            <button
              type="button"
              className={`btn ghost icon ${t.shapeFill ? "active" : ""}`}
              aria-label="Fill shape"
              aria-pressed={t.shapeFill}
              title="Toggle shape interior fill / solid arrowhead"
              onClick={() => {
                const nextFill = !t.shapeFill;
                set({ shapeFill: nextFill });
                sendShapeStylePatch({
                  fill: nextFill,
                  ...(nextFill && t.shapeFillColor ? { fillColor: t.shapeFillColor, fillPaletteIndex: t.shapeFillPaletteIndex } : {}),
                  fillOpacity: t.shapeFillOpacity,
                });
              }}>
              <PaintBucket {...ICON} style={t.shapeFill ? { color: t.shapeFillColor ?? t.color } : undefined} />
            </button>
            <div className="fill-swatches" role="group" aria-label="Fill colours">
              <button
                type="button"
                className={`fill-swatch same ${t.shapeFill && t.shapeFillColor === null ? "on" : ""}`}
                aria-label="Fill same as border"
                title="Fill using border colour"
                onClick={() => {
                  set({ shapeFill: true, shapeFillColor: null, shapeFillPaletteIndex: null });
                  sendShapeStylePatch({ fill: true, clearFillColor: true, fillOpacity: t.shapeFillOpacity });
                }}>
                <span style={{ background: t.color, width: 10, height: 10, borderRadius: 2, display: "block" }} />
              </button>
              {palette.map((c, i) => (
                <button
                  key={`fill-${c}`}
                  type="button"
                  className={`fill-swatch ${t.shapeFill && t.shapeFillPaletteIndex === i ? "on" : ""}`}
                  style={{ background: c }}
                  aria-label={`Fill colour ${i + 1}`}
                  title={`Fill shape with colour ${i + 1}`}
                  onClick={() => {
                    set({ shapeFill: true, shapeFillColor: c, shapeFillPaletteIndex: i });
                    sendShapeStylePatch({ fill: true, fillColor: c, fillPaletteIndex: i, fillOpacity: t.shapeFillOpacity });
                  }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom fill colour"
                title="Custom shape fill colour"
                value={(t.shapeFillColor ?? t.color).length === 7 ? (t.shapeFillColor ?? t.color) : "#4fd1c5"}
                onChange={(e) => {
                  const hex = e.target.value;
                  set({ shapeFill: true, shapeFillColor: hex, shapeFillPaletteIndex: null });
                  sendShapeStylePatch({ fill: true, fillColor: hex, fillPaletteIndex: null, fillOpacity: t.shapeFillOpacity });
                }}
              />
              <button
                type="button"
                className={`btn ghost small mono ${t.shapeFillOpacity >= 0.8 ? "active" : ""}`}
                aria-label="Solid shape fill"
                aria-pressed={t.shapeFillOpacity >= 0.8}
                title={t.shapeFillOpacity >= 0.8 ? "Solid opaque fill (click for translucent tint)" : "Translucent tint fill (click for solid fill)"}
                style={{ padding: "2px 6px", height: 24, fontSize: 11 }}
                onClick={() => {
                  const nextOp = t.shapeFillOpacity >= 0.8 ? 0.42 : 0.9;
                  set({ shapeFill: true, shapeFillOpacity: nextOp });
                  sendShapeStylePatch({ fill: true, fillOpacity: nextOp });
                }}>
                {t.shapeFillOpacity >= 0.8 ? "Solid" : "Tint"}
              </button>
            </div>
          </div>
          <button
            type="button"
            className={`btn ghost icon ${t.shapeDashed ? "active" : ""}`}
            aria-label="Dashed shape"
            aria-pressed={t.shapeDashed}
            title="Dashed shape outline"
            onClick={() => {
              const nextDash = !t.shapeDashed;
              set({ shapeDashed: nextDash });
              sendShapeStylePatch({ dashed: nextDash });
            }}>
            <Minus {...ICON} />
          </button>
        </>
      )}
      {t.tool === "eraser" && (
        <select className="input" aria-label="Eraser mode" value={t.eraseMode} onChange={(e) => set({ eraseMode: e.target.value as "stroke" | "partial" })}>
          <option value="stroke">Whole stroke</option><option value="partial">Partial</option>
        </select>
      )}
      <div className="swatches" role="group" aria-label="Colours">
        {palette.map((c, i) => (
          <button key={c} className={`swatch ${t.paletteIndex === i ? "on" : ""}`} style={{ background: c }} aria-label={`Colour ${i + 1}`}
            onClick={() => set({ color: c, paletteIndex: i })} />
        ))}
        <input type="color" aria-label="Custom colour" value={t.color.length === 7 ? t.color : "#ffffff"}
          onChange={(e) => set({ color: e.target.value, paletteIndex: null })} />
      </div>
      <div className="widths" role="group" aria-label="Width">
        {[2, 3, 5, 8].map((w) => (
          <button key={w} className={`btn ghost icon ${t.width === w ? "active" : ""}`} aria-label={`Width ${w}`}
            title={`Stroke width ${w} ([ / ])`} onClick={() => set({ width: w })}>
            <span style={{ width: w + 2, height: w + 2, borderRadius: "50%", background: "currentColor" }} />
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button className={`btn ghost icon ${ruler ? "active" : ""}`} aria-label="Ruler" aria-pressed={!!ruler}
          title="Ruler [R] (drag to move, turn with the round handle; strokes started next to an edge stay straight)"
          onClick={() => toggleRuler(!ruler)}><RulerIcon {...ICON} /></button>
        {onToggleAudio && (
          <button
            className={`btn ghost icon ${audioOpen || isRecordingHere ? "active" : ""}`}
            aria-label="Lecture audio"
            aria-pressed={!!audioOpen}
            title="Record or replay lecture audio synced to ink"
            style={isRecordingHere ? { color: "var(--danger)" } : undefined}
            onClick={onToggleAudio}>
            <Mic {...ICON} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>{edges.right && edgeButton("right")}</AnimatePresence>
      </div>
      {/* occasional tools live in one menu, so the row keeps the everyday ones. Outside the strip:
          on phones the strip scrolls sideways and would clip a menu opened inside it. */}
      {moreItems.length > 0 && (
        <div className="nb-tb-more" style={{ position: "relative" }}>
          <button className={`btn ghost icon ${moreOn ? "active" : ""}`} aria-label="More tools" aria-haspopup="menu"
            aria-expanded={moreOpen} title="More tools: charts, stamps, split screen, book view…" onClick={() => setMoreOpen(true)}>
            <LayoutGrid {...ICON} />
          </button>
          {moreOpen && <Menu items={moreItems} onClose={() => setMoreOpen(false)} style={{ right: 0, top: 36 }} />}
        </div>
      )}
      <div className="tool-group nb-tb-undo">
        <button className="btn ghost icon" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={onUndo}><Undo2 {...ICON} /></button>
        <button className="btn ghost icon" aria-label="Redo" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={onRedo}><Redo2 {...ICON} /></button>
      </div>
      {currentKind && currentKind !== "ink" && (
        <div className="mode-switch" role="radiogroup" aria-label="Mouse on this page"
          title="A pen always writes. This chooses what the mouse or finger does on text and live pages.">
          <button role="radio" aria-checked={t.mode === "interact"} className={t.mode === "interact" ? "on" : ""}
            onClick={() => set({ mode: "interact" })}>
            {t.mode === "interact" && <motion.span layoutId="mode-pill" className="mode-pill" transition={springs.snappy} />}
            <MousePointer2 {...ICON} />Use page</button>
          <button role="radio" aria-checked={t.mode === "annotate"} className={t.mode === "annotate" ? "on" : ""}
            onClick={() => set({ mode: "annotate" })}>
            {t.mode === "annotate" && <motion.span layoutId="mode-pill" className="mode-pill" transition={springs.snappy} />}
            <PenLine {...ICON} />Write on page</button>
        </div>
      )}
      <div className="tool-group nb-toolbar-right">
        <button className="btn ghost icon" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}><ZoomOut {...ICON} /></button>
        <button type="button" className="zoom-readout mono dim" aria-label="Reset zoom" title="Click to toggle Fit width / 100%"
          onClick={() => (onResetZoom ? onResetZoom() : setZoom(1))}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="btn ghost icon" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}><ZoomIn {...ICON} /></button>
      </div>
      <div className="nb-tb-options" style={{ position: "relative" }}>
        <button className="btn ghost icon" aria-label="Notebook options" onClick={() => setMenu(true)}><MoreHorizontal {...ICON} /></button>
        {menu && (
          <Menu onClose={() => setMenu(false)} style={{ right: 0, top: 34 }} footer={coverFooter} items={[
            ...(onOpenSpeechNote ? [{
              label: "Speech-to-text note (Sarvam AI)...",
              icon: <AudioLines size={14} strokeWidth={1.5} />,
              onSelect: onOpenSpeechNote,
            }] : []),
            ...(onNotebookAi ? [{
              label: "Summarise notebook (Gemini)",
              icon: <Sparkles size={14} strokeWidth={1.5} />,
              onSelect: () => onNotebookAi("summary"),
            }, {
              label: "Flashcards from notebook (Gemini)",
              icon: <Sparkles size={14} strokeWidth={1.5} />,
              onSelect: () => onNotebookAi("cards"),
            }] : []),
            ...(onOpenTemplates && currentKind === "ink" ? [{
              label: "Page templates...",
              icon: <LayoutTemplate size={14} strokeWidth={1.5} />,
              onSelect: onOpenTemplates,
            }] : []),
            ...(onGenerateTapeCards && currentKind === "ink" ? [{
              label: "Generate flashcards from Tape",
              icon: <GraduationCap size={14} strokeWidth={1.5} />,
              onSelect: onGenerateTapeCards,
            }] : []),
            ...(onExportPdf ? [{ label: "Export PDF", onSelect: onExportPdf }] : []),
            ...(onExportOptions ? [{ label: "Export...", onSelect: onExportOptions }] : []),
            ...(onExportBackup ? [{ label: "Export backup (.opennote)", onSelect: onExportBackup }] : []),
            { label: notebook.paper === "dark" ? "Light paper" : "Dark paper", onSelect: () => updateNotebook(notebook.id, { paper: notebook.paper === "dark" ? "light" : "dark" }) },
            ...(onOpenSettings ? [{ label: "Settings & shortcuts", icon: <Settings size={14} strokeWidth={1.5} />, shortcut: "?", onSelect: onOpenSettings }] : []),
          ]} />
        )}
      </div>
    </header>
  );
}
