/**
 * Palm rejection as its own step, before any stroke is made (report: "Handwriting engine comparative
 * report", §5.4). The renderer never decides who is a palm; this gate does, from what the browser tells us:
 *
 * - No pen in range: fingers write (or only scroll/zoom, in pen-only mode, or once a pen was seen).
 * - Pen hovering or touching, or lifted less than a moment ago: single-finger contacts are a resting hand.
 *   They neither write nor scroll. (Two-finger pinch zoom is handled separately and still works.)
 * - A contact bigger than a fingertip is a palm, whatever else is going on.
 * - Two same-sized touches landing far apart in time are a hand and a stylus, not a pinch: the one not
 *   writing is the palm (passive stylus screens, where the palm blob can be as small as the tip).
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
export type GateStats = { pen: number; touchWrite: number; touchNavigate: number; palmBySize: number; palmByCluster: number; palmByTiming: number; palmByPen: number; cancelled: number; last: string };
const stats: GateStats = { pen: 0, touchWrite: 0, touchNavigate: 0, palmBySize: 0, palmByCluster: 0, palmByTiming: 0, palmByPen: 0, cancelled: 0, last: "" };
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

/*
 * ---- touch screens without a real pen (passive stylus, finger) ----
 * Measured on a Redmi Pad (capacitive only, no stylus input, Android palm rejection off): a passive
 * stylus or fingertip reports a contact ~3 CSS px wide; a resting palm 4–14 px per blob, splitting into
 * 5–7 simultaneous contacts; the heel of the hand 6–26 px. Screens report sizes very differently, so the
 * palm limit is learned from this device's own writing contacts and remembered.
 */
const WIDTH_KEY = "opennote.touchWidths";
const MAX_SAMPLES = 24;
/** Above this many simultaneous touches it's a hand on the glass, not a gesture. */
const CLUSTER = 3;
/*
 * Two touches the same size (a palm blob is often no bigger than the stylus tip on these screens): timing
 * decides. Pinch fingers land together (0–100 ms apart on the Redmi Pad); a hand lands well before or after.
 */
/** Touches landing closer together than this are a two-finger gesture. */
export const TOGETHER_MS = 150;
/** A touch that has drawn this far (CSS px) is writing; a resting hand barely moves. */
const WRITING_PATH_PX = 12;
let widths: number[] = (() => { try { return JSON.parse(localStorage.getItem(WIDTH_KEY) ?? "[]") as number[]; } catch { return []; } })();
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/** Typical width of a writing contact on this screen (CSS px), once a few strokes have been seen. */
export function typicalTouchWidth(): number | null { return widths.length >= 3 ? median(widths) : null; }

/** A contact wider than this is a palm. Learned per device; generous until learned. */
export function palmWidthLimit(): number {
  const t = typicalTouchWidth();
  return t ? Math.max(t * 1.35, t + 0.8) : PALM_CONTACT_PX;
}

const contactWidth = (e: Pick<PointerEvent, "width" | "height">) => Math.max(e.width ?? 0, e.height ?? 0);

/** Bigger than a writing contact on this screen: a palm or the side of a hand. Sizes of 0 or 1 mean "not reported". */
export function isPalmContact(e: Pick<PointerEvent, "width" | "height">): boolean {
  const w = contactWidth(e);
  return w > 1 && w > palmWidthLimit();
}

/** Learn from a finished touch that clearly wrote (moved, short, alone, not a palm). */
export function learnWritingContact(maxWidth: number): void {
  if (!(maxWidth > 1) || maxWidth > PALM_CONTACT_PX) return;
  widths = [...widths, Math.round(maxWidth * 100) / 100].slice(-MAX_SAMPLES);
  try { localStorage.setItem(WIDTH_KEY, JSON.stringify(widths)); } catch { /* private mode */ }
}

type Live = { start: number; maxW: number; path: number; x: number; y: number; alone: boolean; palm: boolean };
const live = new Map<number, Live>();
const palmSubs = new Set<(pointerId: number) => void>();
/** Hear when a touch already in progress turns out to be a palm (it grew, or a whole hand landed). */
export function onPalmDetected(f: (pointerId: number) => void): () => void { palmSubs.add(f); return () => { palmSubs.delete(f); }; }
export const isPalmPointer = (pointerId: number): boolean => live.get(pointerId)?.palm === true;
/** Touches on the glass right now that are not palms (for pinch zoom). */
export const fingerCount = (): number => [...live.values()].filter((l) => !l.palm).length;

function markPalm(id: number, l: Live, why: "size" | "cluster" | "timing") {
  if (l.palm) return;
  l.palm = true;
  if (why === "size") stats.palmBySize++; else if (why === "cluster") stats.palmByCluster++; else stats.palmByTiming++;
  stats.last = `touch ${l.maxW.toFixed(1)}px → palm (${why})`;
  changed();
  palmSubs.forEach((f) => f(id));
}

/** Watch every touch from the document, before the page handles it. */
export function trackTouch(e: Pick<PointerEvent, "type" | "pointerId" | "pointerType" | "width" | "height" | "clientX" | "clientY">, now = performance.now()): void {
  if (e.pointerType !== "touch") return;
  const w = contactWidth(e);
  if (e.type === "pointerdown") {
    const l: Live = { start: now, maxW: w, path: 0, x: e.clientX, y: e.clientY, alone: live.size === 0, palm: false };
    live.set(e.pointerId, l);
    for (const o of live.values()) if (o !== l) o.alone = false;
    if (isPalmContact(e)) markPalm(e.pointerId, l, "size");
    // a second touch long after the first is the hand, not a pinch: whichever of the two isn't writing
    if (live.size === 2 && !l.palm) {
      const [firstId, first] = [...live].find(([id]) => id !== e.pointerId)!;
      if (!first.palm && now - first.start >= TOGETHER_MS) {
        if (first.path >= WRITING_PATH_PX) markPalm(e.pointerId, l, "timing"); // landed mid-stroke
        else markPalm(firstId, first, "timing"); // was resting; the stylus just arrived
      }
    }
    // a whole hand: every contact on the glass is palm
    if (live.size >= CLUSTER) for (const [id, o] of live) markPalm(id, o, "cluster");
    return;
  }
  const l = live.get(e.pointerId);
  if (!l) return;
  if (e.type === "pointermove") {
    l.path += Math.hypot(e.clientX - l.x, e.clientY - l.y);
    l.x = e.clientX; l.y = e.clientY;
    if (w > l.maxW) l.maxW = w;
    // a palm often lands small and spreads as it settles
    if (isPalmContact(e)) markPalm(e.pointerId, l, "size");
    return;
  }
  if (e.type === "pointerup" || e.type === "pointercancel") {
    live.delete(e.pointerId);
    if (e.type === "pointerup" && !l.palm && l.alone && l.path > 25 && now - l.start < 3000) learnWritingContact(l.maxW);
  }
}

/** What a new touch contact should do. `penSeen`: a pen has been used on this device this session. */
export function judgeTouch(e: Pick<PointerEvent, "width" | "height"> & Partial<Pick<PointerEvent, "pointerId">>, opts: { penSeen: boolean; now?: number }): TouchVerdict {
  const now = opts.now ?? performance.now();
  let v: TouchVerdict;
  if (e.pointerId !== undefined && isPalmPointer(e.pointerId)) { v = "palm"; }
  else if (isPalmContact(e)) { v = "palm"; stats.palmBySize++; }
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
  Object.assign(stats, { pen: 0, touchWrite: 0, touchNavigate: 0, palmBySize: 0, palmByCluster: 0, palmByTiming: 0, palmByPen: 0, cancelled: 0, last: "" });
  live.clear();
  widths = [];
  changed();
}

// The pen can hover over any page, a toolbar or a gap between pages: watch it everywhere.
if (typeof document !== "undefined") {
  const seePen = (e: PointerEvent) => { if (e.pointerType === "pen") notePen(e.type, performance.now(), e.buttons > 0); };
  for (const t of ["pointerover", "pointerenter", "pointermove", "pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
    document.addEventListener(t, seePen as EventListener, { capture: true, passive: true });
  }
  const seeTouch = (e: PointerEvent) => trackTouch(e);
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    document.addEventListener(t, seeTouch as EventListener, { capture: true, passive: true });
  }
}
