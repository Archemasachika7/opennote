"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { motionTokens } from "../ui/motion";
import { turnKey } from "./pageLayout";

const TURN_S = 0.55;
const SWIPE_PX = 60;
const WHEEL_PX = 80;

/**
 * One page at a time. Going forward, the current page swings away around its left edge (the spine) and reveals the
 * next one underneath; going back, the previous page swings in over the current one. Flat: no curl gradients or glow.
 * With reduced motion it is a short cross-fade.
 */
const turn: Variants = {
  enter: (dir: number) => (dir > 0
    ? { rotateY: 0, filter: "brightness(1)", zIndex: 0 }
    : { rotateY: -96, filter: "brightness(0.82)", zIndex: 2 }),
  center: { rotateY: 0, filter: "brightness(1)", zIndex: 1, transition: { duration: TURN_S, ease: motionTokens.easing.smooth, zIndex: { duration: 0 } } },
  exit: (dir: number) => (dir > 0
    ? { rotateY: -96, filter: "brightness(0.82)", zIndex: 2, transition: { duration: TURN_S, ease: motionTokens.easing.smooth, zIndex: { duration: 0 } } }
    : { rotateY: 0, filter: "brightness(0.9)", zIndex: 0, transition: { duration: TURN_S, zIndex: { duration: 0 } } }),
};
const fade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: motionTokens.duration.fast } },
  exit: { opacity: 0, transition: { duration: motionTokens.duration.fast } },
};

export function BookView({ pageKey, index, count, dir, onTurn, onAddPage, scroller, children }: {
  pageKey: string;
  index: number;
  count: number;
  /** direction of the last turn: 1 = forward, -1 = back */
  dir: 1 | -1;
  onTurn: (delta: 1 | -1) => void;
  onAddPage: () => void;
  /** the scrolling element: swipes on its empty margins and sideways trackpad scrolls turn pages */
  scroller: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;

  // keyboard: arrows / Page Up / Page Down, unless typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true], [contenteditable=''], iframe")) return;
      const d = turnKey(e);
      if (!d) return;
      e.preventDefault();
      turnRef.current(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // finger swipe on the margins around the paper (never on the paper itself, where a finger may be writing or panning),
  // and a sideways two-finger trackpad scroll
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let start: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || (e.target as HTMLElement | null)?.closest?.(".paper, button, .menu")) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) turnRef.current(dx < 0 ? 1 : -1);
    };
    const cancel = () => { start = null; };
    let acc = 0, cool = 0;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // only when the page itself has nothing to scroll sideways
      if (el.scrollWidth > el.clientWidth + 1) return;
      e.preventDefault();
      const now = performance.now();
      if (now < cool) return;
      acc += e.deltaX;
      if (Math.abs(acc) >= WHEEL_PX) { turnRef.current(acc > 0 ? 1 : -1); acc = 0; cool = now + TURN_S * 1000; }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", wheel);
    };
  }, [scroller]);

  const last = index >= count - 1;
  return (
    <div className="book" data-testid="book-view">
      <div className="book-stage">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div key={pageKey} className="book-leaf" custom={dir} variants={reduce ? fade : turn}
            initial="enter" animate="center" exit="exit" data-testid="book-leaf">
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
      <nav className="book-nav" aria-label="Turn pages" data-blot-avoid>
        <button type="button" className="btn ghost icon book-turn prev" aria-label="Previous page" title="Previous page (Left arrow)"
          disabled={index <= 0} onClick={() => onTurn(-1)}>
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="mono dim small" aria-live="polite">{index + 1} / {count}</span>
        {last ? (
          <button type="button" className="btn ghost icon book-turn next" aria-label="Add page" title="Add a page after this one" onClick={onAddPage}>
            <Plus size={20} strokeWidth={1.5} />
          </button>
        ) : (
          <button type="button" className="btn ghost icon book-turn next" aria-label="Next page" title="Next page (Right arrow)" onClick={() => onTurn(1)}>
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        )}
      </nav>
    </div>
  );
}
