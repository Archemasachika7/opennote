/**
 * Bridge to the native Jetpack Ink layer in the Android app (android/.../NativeInkPlugin.kt).
 *
 * The native side draws the line under a stylus with low latency; this side keeps OpenNote's own ink
 * engine the source of truth:
 * - tells native where the writing surfaces are (CSS px), which pen and colour are in use, and whether
 *   the current tool should write at all ("armed");
 * - on a finished stroke, replays its points into that surface as pen PointerEvents, so the normal
 *   InkLayer path saves it (undo, layers, palm gate, audio sync, sync), then tells native to drop its copy;
 * - passes pen up/down to the web palm gate.
 * Off unless running in the Android app; a setting can turn it off there too (to compare engines).
 */
import { useSyncExternalStore } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { getTool, onToolChange } from "../notebook/tool";
import { notePen } from "../ink/palmGate";

type Target = { id: string; left: number; top: number; width: number; height: number; size: number };
interface NativeInkApi {
  configure(o: { enabled: boolean; armed: boolean; color: number; family: "pen" | "marker" | "highlighter"; targets: Target[] }): Promise<void>;
  release(o: { keys: number[] }): Promise<void>;
  addListener(ev: "stroke", fn: (d: { key: number; target: string; points: number[] }) => void): Promise<PluginListenerHandle>;
  addListener(ev: "pen", fn: (d: { state: "down" | "up" }) => void): Promise<PluginListenerHandle>;
}
const NativeInk = registerPlugin<NativeInkApi>("NativeInk");

export const nativeInkAvailable = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/* ---- setting: on by default only in the "Ink Lab" test build (app id ends with .inklab) until tablet-tested ---- */
const KEY = "opennote.nativeInk";
const subs = new Set<() => void>();
const stored = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
let on = stored === "on";
export const getNativeInk = (): boolean => on;
export function setNativeInk(v: boolean): void {
  on = v;
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* private mode */ }
  subs.forEach((f) => f());
  schedule();
}
export const useNativeInk = (): boolean =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getNativeInk, getNativeInk);

/* ---- surfaces ---- */
const SIZE: Record<string, number> = { marker: 3, pencil: 1.5, beautify: 2.3, inkbrush: 3.4, oblique: 2.4, rainbow: 2.4 };
const byId = new Map<string, HTMLElement>();
const idOf = new WeakMap<HTMLElement, string>();
let seq = 0;

/** "#RRGGBB" → signed 32-bit ARGB, as Android's Color int. */
export function hexToArgb(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? parseInt(m[1], 16) : 0x202020;
  return (0xff000000 | rgb) | 0;
}

function targets(): Target[] {
  const t = getTool();
  const factor = t.tool === "highlighter" ? 4 : SIZE[t.variant] ?? 2;
  const out: Target[] = [];
  byId.clear();
  const vw = window.innerWidth, vh = window.innerHeight;
  document.querySelectorAll<HTMLElement>('[data-testid="ink-surface"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return;
    let id = idOf.get(el);
    if (!id) { id = `s${++seq}`; idOf.set(el, id); }
    byId.set(id, el);
    const scale = Number(el.dataset.inkScale) || r.width / 1404;
    out.push({ id, left: r.left, top: r.top, width: r.width, height: r.height, size: t.width * factor * scale });
  });
  return out;
}

let frame = 0;
function schedule(): void {
  if (!started || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const t = getTool();
    const armed = t.tool === "pen" || t.tool === "highlighter";
    void NativeInk.configure({
      enabled: on, armed, color: hexToArgb(t.color),
      family: t.tool === "highlighter" ? "highlighter" : t.variant === "marker" ? "marker" : "pen",
      targets: on && armed ? targets() : [],
    }).catch(() => undefined);
  });
}

/** Replay a native stroke into the web ink engine as pen events (it then saves it like any other). */
export function replayStroke(el: HTMLElement, points: number[], pointerId: number): void {
  const fire = (type: string, i: number, buttons: number) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId, pointerType: "pen", isPrimary: true,
    clientX: points[i], clientY: points[i + 1], pressure: buttons ? points[i + 2] : 0, buttons, button: 0, width: 1, height: 1,
  }));
  if (points.length < 4) return;
  fire("pointerdown", 0, 1);
  for (let i = 4; i < points.length; i += 4) fire("pointermove", i, 1);
  fire("pointerup", points.length - 4, 0);
}

let started = false;
export function startNativeInk(): void {
  if (started || !nativeInkAvailable()) return;
  started = true;
  if (stored === null) {
    void App.getInfo().then((info) => {
      if (info.id.endsWith(".inklab")) { on = true; subs.forEach((f) => f()); schedule(); }
    }).catch(() => undefined);
  }
  void NativeInk.addListener("pen", (d) => notePen(d.state === "down" ? "pointerdown" : "pointerup", performance.now(), d.state === "down"));
  void NativeInk.addListener("stroke", (d) => {
    const el = byId.get(d.target);
    if (el?.isConnected) replayStroke(el, d.points, 50_000 + d.key);
    // drop the native copy once the page has painted the saved line (two frames: commit, then paint)
    requestAnimationFrame(() => requestAnimationFrame(() => { void NativeInk.release({ keys: [d.key] }).catch(() => undefined); }));
  });
  onToolChange(schedule);
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule);
  // pages appear, zoom changes, the sidebar opens: re-measure a few times a second (cheap)
  window.setInterval(schedule, 400);
  schedule();
}
