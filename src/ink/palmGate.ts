/**
 * Palm rejection as its own step, before any stroke is made (report: "Handwriting engine comparative
 * report", §5.4). The renderer never decides who is a palm; this gate does, from what the browser tells us:
 *
 * - No pen in range: fingers write (or only scroll/zoom, in pen-only mode, or once a pen was seen).
 * - Pen hovering or touching, or lifted less than a moment ago: single-finger contacts are a resting hand.
 *   They neither write nor scroll. (Two-finger pinch zoom is handled separately and still works.)
 * - A contact bigger than a fingertip is a palm, whatever else is going on.
 * - A pointer the browser cancels never commits its line (enforced in InkLayer).
 *
 * Platform signals first (pointerType, hover, contact size), timing second. It is a heuristic: device
 * testing decides the thresholds, and the diagnostics overlay (?debug=palm) shows what it decided.
 */
import { useSyncExternalStore } from "react";

/*
 * Timings and size from Inklus (an Android stylus note app whose palm rejection was tuned on real S-Pen
 * hardware; values only, no code, Inklus is GPL): the hand lands just before or after a stroke.
 */
/** How long after the pen lifted off the screen a lone touch still counts as the resting hand. */
export const PEN_GRACE_MS = 400;
/** How long after the last hover event the pen still counts as "near" (hover is reported ~1 cm up). */
export const HOVER_GRACE_MS = 350;
/** Contact width or height (CSS px) above which a touch is a palm, not a fingertip (Inklus: radius 28). */
export const PALM_CONTACT_PX = 56;

export type TouchVerdict = "write" | "navigate" | "palm";

type State = { lastPenAt: number; lastHoverAt: number; penDown: boolean; penOnly: boolean };
const state: State = { lastPenAt: -Infinity, lastHoverAt: -Infinity, penDown: false, penOnly: readPenOnly() };

/* ---- diagnostics (read by the ?debug=palm overlay) ---- */
export type GateStats = { pen: number; touchWrite: number; touchNavigate: number; palmBySize: number; palmByPen: number; cancelled: number; last: string };
const stats: GateStats = { pen: 0, touchWrite: 0, touchNavigate: 0, palmBySize: 0, palmByPen: 0, cancelled: 0, last: "" };
const subs = new Set<() => void>();
let snapshot = { ...stats };
const changed = () => { snapshot = { ...stats }; subs.forEach((f) => f()); };
export const useGateStats = (): GateStats =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snapshot, () => snapshot);

/* ---- pen-only mode (a setting, saved on this device) ---- */
const KEY = "opennote.penOnly";
function readPenOnly(): boolean { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } }
const modeSubs = new Set<() => void>();
export const getPenOnly = (): boolean => state.penOnly;
export function setPenOnly(on: boolean): void {
  state.penOnly = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
  modeSubs.forEach((f) => f());
}
export const usePenOnly = (): boolean =>
  useSyncExternalStore((f) => { modeSubs.add(f); return () => { modeSubs.delete(f); }; }, getPenOnly, getPenOnly);

/* ---- the gate ---- */

/** Feed every pen event (hover, down, move, up, leave). */
export function notePen(type: string, now: number = performance.now(), touching = false): void {
  if (type === "pointerdown") state.penDown = true;
  else if (type === "pointerup" || type === "pointercancel") state.penDown = false;
  // a move with the pen on the glass is contact; anything else (over, enter, leave, a move above it) is hover
  if (type === "pointerdown" || type === "pointerup" || type === "pointercancel" || touching) state.lastPenAt = now;
  else state.lastHoverAt = now;
}

/** Is the pen in play right now (touching, hovering, or just lifted)? */
export function penActive(now: number = performance.now()): boolean {
  return state.penDown || now - state.lastPenAt < PEN_GRACE_MS || now - state.lastHoverAt < HOVER_GRACE_MS;
}

/** Bigger than a fingertip: a palm or the side of a hand. Browsers that don't report size give 0 or 1. */
export function isPalmContact(e: Pick<PointerEvent, "width" | "height">): boolean {
  return (e.width ?? 0) > PALM_CONTACT_PX || (e.height ?? 0) > PALM_CONTACT_PX;
}

/** What a new touch contact should do. `penSeen`: a pen has been used on this device this session. */
export function judgeTouch(e: Pick<PointerEvent, "width" | "height">, opts: { penSeen: boolean; now?: number }): TouchVerdict {
  const now = opts.now ?? performance.now();
  let v: TouchVerdict;
  if (isPalmContact(e)) { v = "palm"; stats.palmBySize++; }
  else if (penActive(now)) { v = "palm"; stats.palmByPen++; }
  else if (state.penOnly || opts.penSeen) { v = "navigate"; stats.touchNavigate++; }
  else { v = "write"; stats.touchWrite++; }
  stats.last = `touch ${Math.round(e.width ?? 0)}×${Math.round(e.height ?? 0)} → ${v}`;
  changed();
  return v;
}

export function countPen(): void { stats.pen++; stats.last = "pen → write"; changed(); }
export function countCancelled(): void { stats.cancelled++; stats.last = "cancelled: line discarded"; changed(); }

/** Tests only. */
export function resetGate(): void {
  state.lastPenAt = -Infinity; state.lastHoverAt = -Infinity; state.penDown = false;
  Object.assign(stats, { pen: 0, touchWrite: 0, touchNavigate: 0, palmBySize: 0, palmByPen: 0, cancelled: 0, last: "" });
  changed();
}

// The pen can hover over any page, a toolbar or a gap between pages: watch it everywhere.
if (typeof document !== "undefined") {
  const seePen = (e: PointerEvent) => { if (e.pointerType === "pen") notePen(e.type, performance.now(), e.buttons > 0); };
  for (const t of ["pointerover", "pointerenter", "pointermove", "pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
    document.addEventListener(t, seePen as EventListener, { capture: true, passive: true });
  }
}
