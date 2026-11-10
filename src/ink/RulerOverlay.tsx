"use client";
import { useRef } from "react";
import { RotateCw, X } from "lucide-react";
import { setRuler, snapAngle, useRuler, RULER_LENGTH, RULER_THICKNESS } from "./ruler";
import { tryCapture } from "./input";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** Turn the on-screen ruler on (centred in the window) or off. */
export function toggleRuler(on: boolean): void {
  setRuler(on ? { cx: window.innerWidth / 2, cy: window.innerHeight / 2, angle: 0, length: RULER_LENGTH, thickness: RULER_THICKNESS } : null);
}

/**
 * A straight edge floating over the pages. Drag it to move, drag the round handle (or scroll the
 * wheel over it) to turn it. Pen and highlighter strokes started next to an edge follow the edge.
 */
export function RulerOverlay() {
  const r = useRuler();
  const drag = useRef<{ mode: "move" | "turn"; id: number; dx: number; dy: number } | null>(null);
  if (!r) return null;

  const start = (mode: "move" | "turn") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    tryCapture(e.currentTarget as Element, e.pointerId);
    drag.current = { mode, id: e.pointerId, dx: e.clientX - r.cx, dy: e.clientY - r.cy };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.mode === "move") setRuler({ ...r, cx: e.clientX - d.dx, cy: e.clientY - d.dy });
    else setRuler({ ...r, angle: snapAngle((Math.atan2(e.clientY - r.cy, e.clientX - r.cx) * 180) / Math.PI) });
  };
  const end = (e: React.PointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  const shown = ((Math.round(r.angle) % 360) + 360) % 360;
  return (
    <div className="ruler" role="group" aria-label="Ruler" data-testid="ruler"
      style={{ left: r.cx - r.length / 2, top: r.cy - r.thickness / 2, width: r.length, height: r.thickness, transform: `rotate(${r.angle}deg)` }}
      onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onWheel={(e) => setRuler({ ...r, angle: snapAngle(r.angle + (e.deltaY > 0 ? 1 : -1)) })}>
      <span className="ruler-ticks" aria-hidden />
      <span className="ruler-angle mono" style={{ transform: `rotate(${-r.angle}deg)` }}>{shown > 180 ? shown - 360 : shown}&deg;</span>
      <button className="ruler-btn ruler-close" aria-label="Hide ruler" onPointerDown={(e) => e.stopPropagation()} onClick={() => setRuler(null)}><X {...I} /></button>
      <span className="ruler-btn ruler-turn" role="slider" aria-label="Turn ruler" aria-valuenow={Math.round(r.angle)} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") setRuler({ ...r, angle: r.angle - 1 });
          if (e.key === "ArrowRight" || e.key === "ArrowUp") setRuler({ ...r, angle: r.angle + 1 });
        }}
        onPointerDown={start("turn")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><RotateCw {...I} /></span>
    </div>
  );
}
