import { useRef } from "react";
import { Copy, Crop, Palette, RotateCw, Trash2 } from "lucide-react";
import type { Box } from "./geometry";
import { IDENTITY, type Xf } from "./selection";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** Selection box with move (drag body), uniform scale (corner) and rotate (top handle). */
export function SelectionOverlay({ box, scale, xf, onPreview, onCommit, onDelete, onDuplicate, onRecolor, onCrop }: {
  box: Box; scale: number; xf: Xf; onPreview: (m: Xf) => void; onCommit: (m: Xf) => void;
  onDelete: () => void; onDuplicate: () => void; onRecolor: () => void; onCrop?: () => void;
}) {
  const drag = useRef<{ mode: "move" | "scale" | "rotate"; x: number; y: number } | null>(null);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  const compute = (e: React.PointerEvent): Xf => {
    const d = drag.current!;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (d.mode === "move") return { ...IDENTITY, dx, dy, cx, cy };
    if (d.mode === "scale") {
      const k = Math.max(0.1, (box.w + dx) / box.w);
      // keep the top-left corner fixed: centre moves by half the growth
      return { ...IDENTITY, k, cx: box.x, cy: box.y };
    }
    const r0 = Math.atan2(d.y / scale - cy, d.x / scale - cx);
    const r1 = Math.atan2(d.y / scale + dy - cy, d.x / scale + dx - cx);
    return { ...IDENTITY, r: r1 - r0, cx, cy };
  };

  const start = (mode: "move" | "scale" | "rotate") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY };
  };
  const move = (e: React.PointerEvent) => { if (drag.current) onPreview(compute(e)); };
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const m = compute(e);
    drag.current = null;
    onCommit(m);
  };

  const t = `translate(${xf.dx * scale}px, ${xf.dy * scale}px)`;
  return (
    <div className="sel" data-testid="selection" onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale, transform: t }}>
      <span className="sel-rot" data-testid="sel-rotate" onPointerDown={start("rotate")} onPointerMove={move} onPointerUp={end}><RotateCw {...I} /></span>
      <span className="sel-scale" data-testid="sel-scale" onPointerDown={start("scale")} onPointerMove={move} onPointerUp={end} />
      <div className="sel-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn ghost icon" aria-label="Recolour selection" onClick={onRecolor}><Palette {...I} /></button>
        <button className="btn ghost icon" aria-label="Duplicate selection" onClick={onDuplicate}><Copy {...I} /></button>
        {onCrop && <button className="btn ghost icon" aria-label="Crop image" onClick={onCrop}><Crop {...I} /></button>}
        <button className="btn ghost icon" aria-label="Delete selection" onClick={onDelete}><Trash2 {...I} /></button>
      </div>
    </div>
  );
}
