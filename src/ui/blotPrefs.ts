import { useSyncExternalStore } from "react";

// Blot on/off and where it sits along the bottom edge, saved on this device. On by default.
const KEY = "opennote.blot", KEY_X = "opennote.blot.x";
const listeners = new Set<() => void>();
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private browsing */ } };

let enabled = read(KEY) !== "off";

export const getBlotEnabled = (): boolean => enabled;
export function setBlotEnabled(on: boolean): void {
  enabled = on; write(KEY, on ? "on" : "off"); listeners.forEach((f) => f());
}
export function useBlotEnabled(): boolean {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getBlotEnabled, getBlotEnabled);
}

/** Position along the bottom edge as a fraction of the window width (0 = left, 1 = right). */
export function getBlotX(): number { const v = Number(read(KEY_X)); return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.93; }
export function setBlotX(x: number): void { write(KEY_X, String(Math.min(0.97, Math.max(0.03, x)))); }
