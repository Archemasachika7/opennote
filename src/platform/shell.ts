type ShellGlobals = {
  Capacitor?: { isNativePlatform?: () => boolean };
  __TAURI_INTERNALS__?: unknown;
};

/** True inside the Android (Capacitor) or Windows (Tauri) app, where a marketing landing page makes no sense. */
export function isNativeShell(g: ShellGlobals = globalThis as ShellGlobals): boolean {
  if (g.__TAURI_INTERNALS__) return true;
  try { return g.Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}
