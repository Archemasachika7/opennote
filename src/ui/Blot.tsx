import { useEffect, useMemo, useRef, useState } from "react";
import { blotVoxelSvg, type BlotPose } from "./blotSprite";
import { onBlot, type BlotMood } from "./blotBus";
import { getBlotX, setBlotX, useBlotEnabled } from "./blotPrefs";
import "./blot.css";

type Mood = "idle" | BlotMood;
const HOLD: Record<BlotMood, number> = { hop: 900, cheer: 1400, peek: 1300, wave: 1200 };
const POSE: Record<Mood, BlotPose> = {
  idle: { eyes: "open", arms: "down" }, hop: { eyes: "open", arms: "up" }, cheer: { eyes: "happy", arms: "up" },
  peek: { eyes: "open", arms: "down" }, wave: { eyes: "happy", arms: "wave" },
};
const prefersStill = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Blot, the ink-drop companion: sits on the bottom edge, breathes, blinks and reacts to real moments. */
export function Blot() {
  const enabled = useBlotEnabled();
  const [mood, setMood] = useState<Mood>("idle");
  const [blink, setBlink] = useState(false);
  const [x, setX] = useState(getBlotX);
  const still = useMemo(prefersStill, []);
  const timer = useRef<number | undefined>(undefined);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);

  const react = (m: BlotMood) => {
    window.clearTimeout(timer.current);
    setMood(m);
    timer.current = window.setTimeout(() => setMood("idle"), HOLD[m]);
  };
  useEffect(() => onBlot(react), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // blink at uneven intervals
  useEffect(() => {
    if (!enabled) return;
    let t: number;
    const next = () => { t = window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 140); next(); }, 2600 + Math.random() * 2600); };
    next();
    return () => window.clearTimeout(t);
  }, [enabled]);

  const pose = mood === "idle" && blink ? { ...POSE.idle, eyes: "shut" as const } : POSE[mood];
  const svg = useMemo(() => blotVoxelSvg(pose), [pose.eyes, pose.arms]);
  if (!enabled) return null;

  const width = () => (typeof window === "undefined" ? 1000 : window.innerWidth || 1000);
  return (
    <div className="blot" data-testid="blot" data-mood={mood} data-still={still ? "true" : "false"} style={{ left: `calc(${x * 100}% - 26px)` }}>
      <button
        type="button" className="blot-hit" aria-label="Blot, the ink-drop companion (drag to move)" title="Blot"
        onPointerDown={(e) => { drag.current = { x0: e.clientX, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
          if (d.moved) setX(Math.min(0.97, Math.max(0.03, e.clientX / width())));
        }}
        onPointerUp={(e) => {
          const d = drag.current; drag.current = null;
          if (d?.moved) setBlotX(Math.min(0.97, Math.max(0.03, e.clientX / width())));
        }}
        onClick={() => { if (!drag.current) react("wave"); }}
      >
        <svg className="blot-svg" viewBox="-1 -2 19 18" width="54" height="51" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      </button>
    </div>
  );
}
