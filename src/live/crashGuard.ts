type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const KEY = "opennote:running";

export interface CrashGuard {
  isSuspect(pageId: string): boolean;
  forgive(pageId: string): void;
  markRunning(pageId: string): void;
  markStopped(pageId: string): void;
  cleanExit(): void;
}

/**
 * Remembers which live pages are running. If the app dies without a clean exit (e.g. an artifact
 * froze a WebView that does not isolate frames and the app was killed), those pages are "suspects"
 * on the next start and are not auto-run.
 */
export function createCrashGuard(store: KV | null): CrashGuard {
  const read = (): string[] => {
    try { const v = JSON.parse(store?.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const suspects = new Set(read());
  const running = new Set<string>();
  const write = () => { try { store?.setItem(KEY, JSON.stringify([...running])); } catch { /* storage unavailable */ } };
  write();
  return {
    isSuspect: (id) => suspects.has(id),
    forgive: (id) => { suspects.delete(id); },
    markRunning: (id) => { running.add(id); write(); },
    markStopped: (id) => { if (running.delete(id)) write(); },
    cleanExit: () => { running.clear(); write(); },
  };
}

function safeStorage(): KV | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export const crashGuard = createCrashGuard(safeStorage());
if (typeof window !== "undefined") window.addEventListener("pagehide", () => crashGuard.cleanExit());
