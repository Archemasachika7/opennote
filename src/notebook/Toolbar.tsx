import { useEffect, useState } from "react";
import {
  ArrowLeft, Eraser, Hand, Highlighter, Image as ImageIcon, Lasso, MoreHorizontal, MousePointer2, PenLine, Redo2,
  Shapes, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { navigate } from "../App";
import type { Notebook } from "../store/schema";
import { updateNotebook } from "../store/notebooks";
import { Menu } from "../ui/Menu";
import { useTool, type ToolName } from "./tool";
import type { PenVariant } from "../ink/model";

const ICON = { size: 16, strokeWidth: 1.5 } as const;
export const DEFAULT_COLORS = ["#E8E9EE", "#7C5CFF", "#3DDC97", "#FF8A5B", "#5BB8FF", "#F2C94C", "#FF6B6B", "#9A9DAB"];

export function Toolbar({ notebook, zoom, setZoom, onUndo, onRedo, palette = DEFAULT_COLORS }: {
  notebook: Notebook; zoom: number; setZoom: (z: number) => void; onUndo: () => void; onRedo: () => void; palette?: string[];
}) {
  const [t, set] = useTool();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (t.paletteIndex !== null && palette[t.paletteIndex] !== t.color) set({ color: palette[t.paletteIndex] });
  }, [palette, t.paletteIndex, t.color, set]);
  const tools: { name: ToolName; label: string; hint: string; icon: JSX.Element }[] = [
    { name: "pen", label: "Pen", hint: "Pen (draw)", icon: <PenLine {...ICON} /> },
    { name: "highlighter", label: "Highlighter", hint: "Highlighter", icon: <Highlighter {...ICON} /> },
    { name: "eraser", label: "Eraser", hint: "Eraser", icon: <Eraser {...ICON} /> },
    { name: "lasso", label: "Lasso", hint: "Lasso (select and move, does not draw)", icon: <Lasso {...ICON} /> },
    { name: "shape", label: "Shapes", hint: "Shapes (hold still at the end to snap)", icon: <Shapes {...ICON} /> },
    { name: "text", label: "Text box", hint: "Text box (click on the page)", icon: <Type {...ICON} /> },
    { name: "image", label: "Image", hint: "Insert image", icon: <ImageIcon {...ICON} /> },
    { name: "hand", label: "Hand", hint: "Hand (scroll)", icon: <Hand {...ICON} /> },
  ];
  return (
    <header className="nb-toolbar">
      <button className="btn ghost icon" aria-label="Back to library" onClick={() => navigate("/")}><ArrowLeft {...ICON} /></button>
      <span className="nb-name">{notebook.title}</span>
      <div className="tool-group" role="toolbar" aria-label="Tools">
        {tools.map((x) => (
          <button key={x.name} className={`btn ghost icon ${t.tool === x.name ? "active" : ""}`} aria-label={x.label} title={x.hint}
            aria-pressed={t.tool === x.name} onClick={() => set({ tool: x.name })}>{x.icon}</button>
        ))}
      </div>
      {t.tool === "pen" && (
        <select className="input" aria-label="Pen type" value={t.variant} onChange={(e) => set({ variant: e.target.value as PenVariant })}>
          <option value="ball">Ballpoint</option><option value="fountain">Fountain</option><option value="brush">Brush</option>
        </select>
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
          <button key={w} className={`btn ghost icon ${t.width === w ? "active" : ""}`} aria-label={`Width ${w}`} onClick={() => set({ width: w })}>
            <span style={{ width: w + 2, height: w + 2, borderRadius: "50%", background: "currentColor" }} />
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button className="btn ghost icon" aria-label="Undo" onClick={onUndo}><Undo2 {...ICON} /></button>
        <button className="btn ghost icon" aria-label="Redo" onClick={onRedo}><Redo2 {...ICON} /></button>
      </div>
      {!t.penSeen && (
        <button className={`btn ghost ${t.mode === "annotate" ? "active" : ""}`} aria-label="Interact or annotate"
          onClick={() => set({ mode: t.mode === "annotate" ? "interact" : "annotate" })}>
          {t.mode === "annotate" ? <PenLine {...ICON} /> : <MousePointer2 {...ICON} />}
          {t.mode === "annotate" ? "Annotate" : "Interact"}
        </button>
      )}
      <div className="tool-group">
        <button className="btn ghost icon" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}><ZoomOut {...ICON} /></button>
        <span className="mono dim" style={{ minWidth: 42, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button className="btn ghost icon" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}><ZoomIn {...ICON} /></button>
      </div>
      <div style={{ position: "relative" }}>
        <button className="btn ghost icon" aria-label="Notebook options" onClick={() => setMenu(true)}><MoreHorizontal {...ICON} /></button>
        {menu && (
          <Menu onClose={() => setMenu(false)} style={{ right: 0, top: 34 }} items={[
            { label: notebook.paper === "dark" ? "Light paper" : "Dark paper", onSelect: () => updateNotebook(notebook.id, { paper: notebook.paper === "dark" ? "light" : "dark" }) },
          ]} />
        )}
      </div>
    </header>
  );
}
