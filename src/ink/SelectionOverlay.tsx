"use client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { motionTokens } from "../ui/motion";
import { ClipboardCopy, Copy, Crop, Droplet, FileOutput, GraduationCap, Minus, PaintBucket, Palette, RotateCw, Scissors, Sigma, Sparkles, Stamp, Trash2, Type } from "lucide-react";
import type { Box } from "./geometry";
import { IDENTITY, type Xf } from "./selection";
import { tryCapture } from "./input";
import type { ShapeStylePatch } from "../notebook/tool";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** Live "Tidy handwriting" controls, shown in place of the selection toolbar while tidying. */
export type TidyPanel = { strength: number; onStrength: (v: number) => void; onApply: () => void; onCancel: () => void };

/** Selection box with move (drag body), uniform scale (corner) and rotate (top handle). */
export function SelectionOverlay({
  box, scale, origin = { x: 0, y: 0 }, xf,
  hasShape, shapeFilled, shapeDashed,
  shapeFillColor, shapeFillOpacity = 0.42, fillPalette = [],
  onPreview, onCommit, onDelete, onDuplicate, onRecolor, onCrop, onCopy, onCut,
  onToggleFill, onToggleDashed, onUpdateShapeStyle, onSaveElement, onMakeCard, onToText, onToMath, onMoveToPage, onTidy, tidy,
}: {
  box: Box;
  scale: number;
  /** logical point at the surface's top-left (boards) */
  origin?: { x: number; y: number };
  xf: Xf;
  hasShape?: boolean;
  shapeFilled?: boolean;
  shapeDashed?: boolean;
  shapeFillColor?: string;
  shapeFillOpacity?: number;
  fillPalette?: string[];
  onPreview: (m: Xf) => void;
  onCommit: (m: Xf) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRecolor: () => void;
  onCrop?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onToggleFill?: () => void;
  onToggleDashed?: () => void;
  onUpdateShapeStyle?: (patch: ShapeStylePatch) => void;
  onSaveElement?: () => void;
  onMakeCard?: () => void;
  /** Read the selected handwriting as text / as a formula (on-device). */
  onToText?: () => void;
  onToMath?: () => void;
  /** Move the selection to another page (asks which). */
  onMoveToPage?: () => void;
  /** Start tidying the selected handwriting. */
  onTidy?: () => void;
  /** Present while tidying: replaces the toolbar with a strength slider. */
  tidy?: TidyPanel | null;
}) {
  const drag = useRef<{ mode: "move" | "scale" | "rotate"; x: number; y: number; sx: number; sy: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  const latest = useRef({ onPreview, onCommit });
  latest.current = { onPreview, onCommit };

  const compute = (e: { clientX: number; clientY: number }): Xf => {
    const d = drag.current!;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (d.mode === "move") return { ...IDENTITY, dx, dy, cx, cy };
    if (d.mode === "scale") {
      const k = Math.max(0.1, (box.w + dx) / box.w);
      return { ...IDENTITY, k, cx: box.x, cy: box.y };
    }
    const r0 = Math.atan2(d.y - d.sy, d.x - d.sx);
    const r1 = Math.atan2(e.clientY - d.sy, e.clientX - d.sx);
    return { ...IDENTITY, r: r1 - r0, cx, cy };
  };

  const start = (mode: "move" | "scale" | "rotate") => (e: React.PointerEvent) => {
    e.stopPropagation();
    tryCapture(e.currentTarget as Element, e.pointerId);
    const id = e.pointerId;
    const r = el.current?.getBoundingClientRect();
    drag.current = { mode, x: e.clientX, y: e.clientY, sx: r ? r.left + r.width / 2 : e.clientX, sy: r ? r.top + r.height / 2 : e.clientY + 1 };
    const move = (ev: PointerEvent) => { if (ev.pointerId === id && drag.current) latest.current.onPreview(compute(ev)); };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id || !drag.current) return;
      const m = compute(ev);
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      latest.current.onCommit(m);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const t = `translate(${xf.dx * scale}px, ${xf.dy * scale}px)`;
  return (
    <motion.div ref={el} className="sel" data-testid="selection" onPointerDown={start("move")}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: motionTokens.duration.fast }}
      style={{ left: (box.x - origin.x) * scale, top: (box.y - origin.y) * scale, width: box.w * scale, height: box.h * scale, transform: t }}>
      <span className="sel-rot" data-testid="sel-rotate" onPointerDown={start("rotate")}><RotateCw {...I} /></span>
      <span className="sel-scale" data-testid="sel-scale" onPointerDown={start("scale")} />
      {tidy ? (
        <div className="sel-bar sel-tidy" role="group" aria-label="Tidy handwriting" onPointerDown={(e) => e.stopPropagation()}>
          <Sparkles {...I} aria-hidden />
          <label className="sel-tidy-label">
            <span>Light</span>
            <input type="range" min={0} max={100} step={5} value={Math.round(tidy.strength * 100)} aria-label="Tidy strength"
              onChange={(e) => tidy.onStrength(Number(e.target.value) / 100)} />
            <span>Strong</span>
          </label>
          <button className="btn small" onClick={tidy.onApply}>Apply</button>
          <button className="btn ghost small" onClick={tidy.onCancel}>Cancel</button>
        </div>
      ) : (
      <div className="sel-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn ghost icon" aria-label="Recolour selection" title="Set border colour from active swatch" onClick={onRecolor}><Palette {...I} /></button>
        {hasShape && onToggleFill && (
          <button
            className={`btn ghost icon ${shapeFilled ? "active" : ""}`}
            aria-label="Toggle shape fill"
            aria-pressed={!!shapeFilled}
            title="Toggle shape interior fill"
            onClick={onToggleFill}>
            <PaintBucket {...I} style={shapeFilled && shapeFillColor ? { color: shapeFillColor } : undefined} />
          </button>
        )}
        {hasShape && onUpdateShapeStyle && (
          <button
            className={`btn ghost icon ${fillPickerOpen ? "active" : ""}`}
            aria-label="Shape fill colour"
            title="Pick shape interior fill colour & opacity"
            onClick={() => setFillPickerOpen((v) => !v)}>
            <Droplet {...I} style={shapeFillColor ? { color: shapeFillColor } : undefined} />
          </button>
        )}
        {hasShape && onToggleDashed && (
          <button
            className={`btn ghost icon ${shapeDashed ? "active" : ""}`}
            aria-label="Toggle dashed outline"
            aria-pressed={!!shapeDashed}
            title="Toggle dashed outline"
            onClick={onToggleDashed}>
            <Minus {...I} />
          </button>
        )}
        {onSaveElement && (
          <button className="btn ghost icon" aria-label="Save as element" title="Save to Elements & Stamps" onClick={onSaveElement}>
            <Stamp {...I} />
          </button>
        )}
        {onTidy && (
          <button className="btn ghost icon" aria-label="Tidy handwriting" title="Tidy handwriting: straighten lines, even out size, slant and spacing" onClick={onTidy}>
            <Sparkles {...I} />
          </button>
        )}
        {onToText && (
          <button className="btn ghost icon" aria-label="Convert handwriting to text" title="Convert handwriting to text (on this device)" onClick={onToText}>
            <Type {...I} />
          </button>
        )}
        {onToMath && (
          <button className="btn ghost icon" aria-label="Convert handwriting to equation" title="Convert handwritten maths to LaTeX (on this device)" onClick={onToMath}>
            <Sigma {...I} />
          </button>
        )}
        {onMakeCard && (
          <button className="btn ghost icon" aria-label="Create flashcard from selection" title="Create occlusion flashcard" onClick={onMakeCard}>
            <GraduationCap {...I} />
          </button>
        )}
        {onCopy && <button className="btn ghost icon" aria-label="Copy selection" title="Copy (Ctrl+C), then paste on any page with Ctrl+V" onClick={onCopy}><ClipboardCopy {...I} /></button>}
        {onMoveToPage && <button className="btn ghost icon" aria-label="Move selection to another page" title="Move to another page" onClick={onMoveToPage}><FileOutput {...I} /></button>}
        {onCut && <button className="btn ghost icon" aria-label="Cut selection" title="Cut (Ctrl+X) to move it to another page" onClick={onCut}><Scissors {...I} /></button>}
        <button className="btn ghost icon" aria-label="Duplicate selection" title="Duplicate" onClick={onDuplicate}><Copy {...I} /></button>
        {onCrop && <button className="btn ghost icon" aria-label="Crop image" onClick={onCrop}><Crop {...I} /></button>}
        <button className="btn ghost icon" aria-label="Delete selection" onClick={onDelete}><Trash2 {...I} /></button>
      </div>
      )}
      {hasShape && fillPickerOpen && onUpdateShapeStyle && (
        <div className="sel-fill-popover" onPointerDown={(e) => e.stopPropagation()} role="group" aria-label="Selection fill colours">
          {fillPalette.map((c, i) => (
            <button
              key={`sel-fill-${c}`}
              type="button"
              className="fill-swatch"
              style={{ background: c }}
              aria-label={`Selection fill colour ${i + 1}`}
              onClick={() => onUpdateShapeStyle({ fill: true, fillColor: c, fillPaletteIndex: i, fillOpacity: shapeFillOpacity })}
            />
          ))}
          <input
            type="color"
            aria-label="Selection custom fill colour"
            value={shapeFillColor && shapeFillColor.length === 7 ? shapeFillColor : "#4fd1c5"}
            onChange={(e) => onUpdateShapeStyle({ fill: true, fillColor: e.target.value, fillPaletteIndex: null, fillOpacity: shapeFillOpacity })}
          />
          <button
            type="button"
            className={`btn ghost small mono ${shapeFillOpacity >= 0.8 ? "active" : ""}`}
            style={{ padding: "2px 6px", height: 22, fontSize: 11 }}
            onClick={() => onUpdateShapeStyle({ fill: true, fillOpacity: shapeFillOpacity >= 0.8 ? 0.42 : 0.9 })}>
            {shapeFillOpacity >= 0.8 ? "Solid" : "Tint"}
          </button>
          <button
            type="button"
            className="btn ghost small"
            style={{ padding: "2px 6px", height: 22, fontSize: 11 }}
            onClick={() => onUpdateShapeStyle({ fill: false })}>
            None
          </button>
        </div>
      )}
    </motion.div>
  );
}
