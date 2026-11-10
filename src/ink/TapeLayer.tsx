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
export function TapeLayer({ objects, scale, tool, origin = ZERO, hidden, locked }: {
  objects: PageObject[]; scale: number; tool: string; origin?: { x: number; y: number }; hidden?: Set<string>;
  /** layers whose tape cannot be peeled (locked) */
  locked?: Set<string>;
}) {
  const down = useRef<{ id: string; x: number; y: number } | null>(null);
  const tapes = objects.filter((o) => o.kind === "tape" && !hidden?.has(layerOf(o)));
  if (tapes.length === 0) return null;
  const interactive = tool === "tape" || tool === "hand";
  return (
    <div className="tape-layer" data-testid="tape-layer">
      {tapes.map((o) => {
        const color = o.color ?? "#F5A524";
        const canTap = interactive && !locked?.has(layerOf(o));
        return (
          <button key={o.id} type="button" className={`tape ${o.revealed ? "revealed" : ""}`} data-testid={`tape-${o.id}`}
            aria-label="Reveal tape" aria-pressed={!!o.revealed} disabled={!canTap}
            title={canTap ? (o.revealed ? "Tap to cover again" : "Tap to reveal") : "Pick the Tape or Hand tool (on an unlocked layer), then tap to reveal"}
            style={{
              left: (o.x - origin.x) * scale, top: (o.y - origin.y) * scale, width: o.w * scale, height: o.h * scale,
              transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined, ["--tape" as string]: color,
              pointerEvents: canTap ? "auto" : "none",
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
