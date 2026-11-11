import { useEffect, useMemo, useRef, useState } from "react";
import { blotVoxelSvg, type BlotPose } from "./blotSprite";
import { onBlot, type BlotMood } from "./blotBus";
import { getBlotX, setBlotX, useBlotEnabled } from "./blotPrefs";
import "./blot.css";

/** Reactions (from the app or a tap) plus Blot's own ambient behaviour. */
type Mood = "idle" | BlotMood | "walk" | "sleep" | "stretch";
const HOLD: Record<BlotMood | "stretch", number> = {
  hop: 900, cheer: 1400, peek: 1300, wave: 1200, fly: 1700, spin: 900, bounce: 1100, stretch: 900,
};
const POSE: Record<Mood, BlotPose> = {
  idle: { eyes: "open", arms: "down" }, hop: { eyes: "open", arms: "up" }, cheer: { eyes: "happy", arms: "up" },
  peek: { eyes: "open", arms: "down" }, wave: { eyes: "happy", arms: "wave" }, fly: { eyes: "happy", arms: "wings" },
  spin: { eyes: "happy", arms: "up" }, bounce: { eyes: "happy", arms: "up" }, walk: { eyes: "open", arms: "down" },
  sleep: { eyes: "shut", arms: "down" }, stretch: { eyes: "happy", arms: "up" },
};

const WALK_PX_PER_S = 70;
const AMBIENT_MIN_MS = 9000, AMBIENT_SPREAD_MS = 9000;
/** Don't wander while the person is writing or typing. */
const QUIET_AFTER_INPUT_MS = 4000;
const SLEEP_AFTER_MS = 60_000;
const DOUBLE_TAP_MS = 380;
/** How long Blot stays out of the way after the last touch on a page. */
const SHY_MS = 4000;

const prefersStill = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const clampX = (x: number) => Math.min(0.97, Math.max(0.03, x));
const viewW = () => (typeof window === "undefined" ? 1000 : window.innerWidth || 1000);

/**
 * Blot, the ink-drop companion: lives on the bottom edge, breathes and blinks, wanders about, hops,
 * spins, sprouts wings and flies across, dozes off when you're away, and reacts to real moments.
 * Tap to wave, double-tap to fly, drag to move. Reduced motion: expressions only, no movement.
 */
export function Blot() {
  const enabled = useBlotEnabled();
  const [mood, setMood] = useState<Mood>("idle");
  const [shy, setShy] = useState(false);
  const shyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(shyTimer.current), []);
  const [blink, setBlink] = useState(false);
  const [flap, setFlap] = useState(false);
  const [x, setX] = useState(getBlotX);
  const [glide, setGlide] = useState<{ ms: number; ease: string } | null>(null);
  const [facing, setFacing] = useState<1 | -1>(1);
  const still = useMemo(prefersStill, []);
  const timer = useRef<number | undefined>(undefined);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const xRef = useRef(x);
  xRef.current = x;
  const lastInput = useRef(Date.now());
  const lastTap = useRef(0);

  const settle = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setMood("idle"); setGlide(null); }, ms);
  };

  /** Travel to `to` (fraction of the width), walking or flying. */
  const travel = (to: number, how: "walk" | "fly") => {
    const target = clampX(to);
    const dx = (target - xRef.current) * viewW();
    if (Math.abs(dx) < 8 || still) { setGlide(null); setMood(how === "fly" ? "fly" : "hop"); settle(HOLD[how === "fly" ? "fly" : "hop"]); return; }
    setFacing(dx < 0 ? -1 : 1);
    const ms = how === "fly" ? HOLD.fly : Math.max(600, (Math.abs(dx) / WALK_PX_PER_S) * 1000);
    setGlide({ ms, ease: how === "fly" ? "cubic-bezier(.45,.05,.35,1)" : "linear" });
    setMood(how);
    // set the destination on the next frame so the transition runs from the current spot
    requestAnimationFrame(() => setX(target));
    settle(ms + 60);
  };

  const react = (m: BlotMood | "stretch") => {
    if (m === "fly" && !still && moodRef.current !== "fly") {
      // fly somewhere else on screen: at least a third of the width away
      const to = xRef.current > 0.5 ? 0.06 + Math.random() * 0.3 : 0.64 + Math.random() * 0.3;
      travel(to, "fly");
      return;
    }
    setGlide(null);
    setMood(m);
    settle(HOLD[m]);
  };
  const reactRef = useRef(react);
  reactRef.current = react;
  const travelRef = useRef(travel);
  travelRef.current = travel;

  useEffect(() => onBlot((m) => reactRef.current(m)), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // blink at uneven intervals
  useEffect(() => {
    if (!enabled) return;
    let t: number;
    const next = () => { t = window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 140); next(); }, 2600 + Math.random() * 2600); };
    next();
    return () => window.clearTimeout(t);
  }, [enabled]);

  // wings flap while flying
  useEffect(() => {
    if (mood !== "fly") { setFlap(false); return; }
    const t = window.setInterval(() => setFlap((f) => !f), 110);
    return () => window.clearInterval(t);
  }, [mood]);

  // notice the person: input wakes Blot up and keeps it from wandering mid-sentence
  useEffect(() => {
    if (!enabled) return;
    const seen = (e: Event) => {
      lastInput.current = Date.now();
      if (moodRef.current === "sleep") reactRef.current("stretch");
      // writing on a page: duck out of the way (it can sit right where the hand writes on phones),
      // and come back a few seconds after the pen stops
      if (e.type === "pointerdown" && (e.target as Element | null)?.closest?.(".nb-scroll, .wb-stage")) {
        setShy(true);
        window.clearTimeout(shyTimer.current);
        shyTimer.current = window.setTimeout(() => setShy(false), SHY_MS);
      }
    };
    document.addEventListener("pointerdown", seen, { passive: true, capture: true });
    document.addEventListener("keydown", seen, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", seen, { capture: true });
      document.removeEventListener("keydown", seen, { capture: true });
    };
  }, [enabled]);

  // ambient life: every so often, when nobody is writing, do something small
  useEffect(() => {
    if (!enabled || still) return;
    let t: number;
    const tickAmbient = () => {
      t = window.setTimeout(() => {
        tickAmbient();
        if (drag.current || moodRef.current !== "idle") return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        const idleFor = Date.now() - lastInput.current;
        if (idleFor > SLEEP_AFTER_MS) { setGlide(null); setMood("sleep"); window.clearTimeout(timer.current); return; }
        if (idleFor < QUIET_AFTER_INPUT_MS) return;
        const r = Math.random();
        const cur = xRef.current;
        if (r < 0.42) {
          const step = (0.06 + Math.random() * 0.18) * (Math.random() < 0.5 ? -1 : 1);
          const to = cur + step < 0.05 || cur + step > 0.95 ? cur - step : cur + step;
          travelRef.current(to, "walk");
        } else if (r < 0.57) reactRef.current("hop");
        else if (r < 0.69) reactRef.current("spin");
        else if (r < 0.8) reactRef.current("fly");
        else if (r < 0.9) reactRef.current("bounce");
        // else: just sit there and breathe
      }, AMBIENT_MIN_MS + Math.random() * AMBIENT_SPREAD_MS);
    };
    tickAmbient();
    return () => window.clearTimeout(t);
  }, [enabled, still]);

  const base = POSE[mood];
  const pose: BlotPose = mood === "fly" ? { ...base, arms: flap ? "wings-down" : "wings" }
    : (mood === "idle" || mood === "walk") && blink ? { ...base, eyes: "shut" } : base;
  const svg = useMemo(() => blotVoxelSvg(pose), [pose.eyes, pose.arms]);
  if (!enabled) return null;

  return (
    <div className="blot" data-testid="blot" data-mood={mood} data-shy={shy ? "true" : undefined} data-still={still ? "true" : "false"} data-facing={facing}
      style={{
        left: `calc(${x * 100}% - 26px)`,
        transition: glide ? `left ${glide.ms}ms ${glide.ease}` : undefined,
        ["--blot-ms" as string]: glide ? `${glide.ms}ms` : undefined,
      }}>
      {mood === "sleep" && (
        <span className="blot-z" aria-hidden><span>z</span><span>z</span><span>Z</span></span>
      )}
      <button
        type="button" className="blot-hit" aria-label="Blot, the ink-drop companion (tap to wave, double-tap to fly, drag to move)" title="Blot"
        onPointerDown={(e) => { drag.current = { x0: e.clientX, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          if (Math.abs(e.clientX - d.x0) > 4) {
            if (!d.moved) { setGlide(null); window.clearTimeout(timer.current); setMood("idle"); }
            d.moved = true;
          }
          if (d.moved) {
            const nx = clampX(e.clientX / viewW());
            setFacing(nx < xRef.current ? -1 : 1);
            setX(nx);
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current; drag.current = null;
          if (d?.moved) { setBlotX(clampX(e.clientX / viewW())); react("hop"); }
        }}
        onClick={() => {
          if (drag.current) return;
          const now = Date.now();
          const double = now - lastTap.current < DOUBLE_TAP_MS;
          lastTap.current = now;
          react(double ? "fly" : moodRef.current === "sleep" ? "stretch" : "wave");
        }}
      >
        <span className="blot-body">
          <svg className="blot-svg" viewBox="-1 -2 19 18" width="54" height="51" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
        </span>
      </button>
    </div>
  );
}
