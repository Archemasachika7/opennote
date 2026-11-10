import { isNativeShell } from "./shell";

type SW = { register: (url: string) => Promise<unknown>; getRegistrations: () => Promise<readonly { unregister: () => Promise<boolean> }[]> };
type Caches = { keys: () => Promise<string[]>; delete: (key: string) => Promise<boolean> };

/**
 * The offline cache (service worker) is for the website only. The Android and Windows apps ship every file
 * locally, and inside Tauri the worker's page fetch fails, so it kept serving the index.html of the version
 * that registered it; after an update that page asked for scripts that no longer exist and the app went blank.
 * Inside the apps: never register, and remove any worker and cache an older version left behind.
 */
export async function setupServiceWorker(env: { native: boolean; serviceWorker?: SW; caches?: Caches }): Promise<void> {
  const { native, serviceWorker, caches } = env;
  if (!serviceWorker) return;
  if (!native) { await serviceWorker.register("/sw.js"); return; }
  for (const r of await serviceWorker.getRegistrations()) await r.unregister();
  if (caches) for (const k of await caches.keys()) await caches.delete(k);
}

export function startServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const env = { native: isNativeShell(), serviceWorker: navigator.serviceWorker, caches: typeof caches === "undefined" ? undefined : caches };
  if (env.native) { void setupServiceWorker(env).catch(() => undefined); return; }
  window.addEventListener("load", () => { void setupServiceWorker(env).catch(() => undefined); });
}
