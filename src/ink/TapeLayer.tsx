import { useRef } from "react";
import type { PageObject } from "../store/schema";
import { setTapeRevealed } from "./objects";
import { layerOf } from "./layers";

const ZERO = { x: 0, y: 0 };
const TAP_SLOP = 6;

/**
 * Tape strips drawn above the ink. With the Tape or Hand tool, tapping a strip peels it back
 * (shows what is under it) or sticks it down again.
 */
export function TapeLayer({ objects, scale, tool, origin = ZERO, hidden }: {
  objects: PageObject[]; scale: number; tool: string; origin?: { x: number; y: number }; hidden?: Set<string>;
}) {
  const down = useRef<{ id: string; x: number; y: number } | null>(null);
  const tapes = objects.filter((o) => o.kind === "tape" && !hidden?.has(layerOf(o)));
  if (tapes.length === 0) return null;
  const interactive = tool === "tape" || tool === "hand";
  return (
    <div className="tape-layer" data-testid="tape-layer">
      {tapes.map((o) => {
        const color = o.color ?? "#F5A524";
        return (
          <button key={o.id} type="button" className={`tape ${o.revealed ? "revealed" : ""}`} data-testid={`tape-${o.id}`}
            aria-label={o.revealed ? "Cover with tape" : "Reveal under tape"} aria-pressed={!!o.revealed}
            title={interactive ? (o.revealed ? "Tap to cover again" : "Tap to reveal") : "Pick the Tape or Hand tool, then tap to reveal"}
            style={{
              left: (o.x - origin.x) * scale, top: (o.y - origin.y) * scale, width: o.w * scale, height: o.h * scale,
              transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined, ["--tape" as string]: color,
              pointerEvents: interactive ? "auto" : "none",
            }}
            onPointerDown={(e) => { e.stopPropagation(); down.current = { id: o.id, x: e.clientX, y: e.clientY }; }}
            onPointerUp={(e) => {
              const d = down.current;
              down.current = null;
              if (!d || d.id !== o.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
              void setTapeRevealed(o.id, !o.revealed);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void setTapeRevealed(o.id, !o.revealed); } }} />
        );
      })}
    </div>
  );
}
