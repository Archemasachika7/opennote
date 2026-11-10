import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light" | "system";
const STORAGE_KEY = "opennote:theme";

let currentMode: ThemeMode = readStoredTheme();
const subs = new Set<() => void>();

function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch { /* storage restricted */ }
  return "dark";
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

function applyDomTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  if (resolved === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f4f4f6" : "#121318");
}

export function initTheme(): void {
  currentMode = readStoredTheme();
  applyDomTheme(currentMode);
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => {
      if (currentMode === "system") {
        applyDomTheme("system");
        subs.forEach((f) => f());
      }
    };
    mq.addEventListener?.("change", listener);
  }
}

export function getTheme(): ThemeMode {
  return currentMode;
}

export function setTheme(mode: ThemeMode): void {
  currentMode = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* private browsing */ }
  applyDomTheme(mode);
  subs.forEach((f) => f());
}

export function useTheme(): [ThemeMode, (m: ThemeMode) => void, "dark" | "light"] {
  const mode = useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    getTheme,
  );
  return [mode, setTheme, resolveTheme(mode)];
}
