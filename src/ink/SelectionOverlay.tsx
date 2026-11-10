"use client";
import { useRef } from "react";
import { motion } from "motion/react";
import { motionTokens } from "../ui/motion";
import { ClipboardCopy, Copy, Crop, Palette, RotateCw, Scissors, Trash2 } from "lucide-react";
import type { Box } from "./geometry";
import { IDENTITY, type Xf } from "./selection";
import { tryCapture } from "./input";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** Selection box with move (drag body), uniform scale (corner) and rotate (top handle). */
export function SelectionOverlay({ box, scale, origin = { x: 0, y: 0 }, xf, onPreview, onCommit, onDelete, onDuplicate, onRecolor, onCrop, onCopy, onCut }: {
  box: Box; scale: number; /** logical point at the surface's top-left (boards) */ origin?: { x: number; y: number }; xf: Xf;
  onPreview: (m: Xf) => void; onCommit: (m: Xf) => void;
  onDelete: () => void; onDuplicate: () => void; onRecolor: () => void; onCrop?: () => void; onCopy?: () => void; onCut?: () => void;
}) {
  const drag = useRef<{ mode: "move" | "scale" | "rotate"; x: number; y: number; sx: number; sy: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
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
      // keep the top-left corner fixed: centre moves by half the growth
      return { ...IDENTITY, k, cx: box.x, cy: box.y };
    }
    // angles measured on screen around the box centre (sx, sy)
    const r0 = Math.atan2(d.y - d.sy, d.x - d.sx);
    const r1 = Math.atan2(e.clientY - d.sy, e.clientX - d.sx);
    return { ...IDENTITY, r: r1 - r0, cx, cy };
  };

  // Move/up are tracked on window so a drag always commits, even if the pointer is released
  // outside the box or pointer capture was unavailable.
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
      <div className="sel-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn ghost icon" aria-label="Recolour selection" onClick={onRecolor}><Palette {...I} /></button>
        {onCopy && <button className="btn ghost icon" aria-label="Copy selection" title="Copy (Ctrl+C), then paste on any page with Ctrl+V" onClick={onCopy}><ClipboardCopy {...I} /></button>}
        {onCut && <button className="btn ghost icon" aria-label="Cut selection" title="Cut (Ctrl+X) to move it to another page" onClick={onCut}><Scissors {...I} /></button>}
        <button className="btn ghost icon" aria-label="Duplicate selection" title="Duplicate" onClick={onDuplicate}><Copy {...I} /></button>
        {onCrop && <button className="btn ghost icon" aria-label="Crop image" onClick={onCrop}><Crop {...I} /></button>}
        <button className="btn ghost icon" aria-label="Delete selection" onClick={onDelete}><Trash2 {...I} /></button>
      </div>
    </motion.div>
  );
}
