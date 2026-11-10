import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setupServiceWorker } from "../../src/platform/serviceWorker";

// A fake browser for the page side: navigator.serviceWorker + CacheStorage.
function fakePage(existing = 1) {
  const regs = Array.from({ length: existing }, () => ({ unregister: vi.fn(async () => true) }));
  const sw = { register: vi.fn(async () => ({})), getRegistrations: vi.fn(async () => regs) };
  const caches = { keys: vi.fn(async () => ["opennote-shell-v1"]), delete: vi.fn(async () => true) };
  return { regs, sw, caches };
}

describe("setupServiceWorker (page side)", () => {
  it("registers /sw.js on the web", async () => {
    const f = fakePage(0);
    await setupServiceWorker({ native: false, serviceWorker: f.sw, caches: f.caches });
    expect(f.sw.register).toHaveBeenCalledWith("/sw.js");
  });

  it("never registers inside the apps, and removes an old worker and its caches", async () => {
    const f = fakePage(1);
    await setupServiceWorker({ native: true, serviceWorker: f.sw, caches: f.caches });
    expect(f.sw.register).not.toHaveBeenCalled();
    expect(f.regs[0].unregister).toHaveBeenCalled();
    expect(f.caches.delete).toHaveBeenCalledWith("opennote-shell-v1");
  });
});

// The worker itself, run in a sandbox with fake Cache Storage and fetch.
function loadWorker(hostname: string, fetchImpl: (req: Req) => Promise<Res>) {
  const store = new Map<string, Res>();
  const listeners: Record<string, (e: unknown) => void> = {};
  const cache = { put: vi.fn(async (k: Req | string, r: Res) => { store.set(typeof k === "string" ? k : k.url, r); }), addAll: vi.fn(async () => undefined) };
  const clients = { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => [{ url: `http://${hostname}/`, navigate: vi.fn() }]) };
  const self = {
    location: { origin: `http://${hostname}`, hostname, protocol: "http:" },
    registration: { unregister: vi.fn(async () => true) },
    skipWaiting: vi.fn(), clients,
    addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
  };
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async (k: string) => store.get(k)), keys: vi.fn(async () => ["opennote-shell-v1"]), delete: vi.fn(async () => true) };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches, fetch: fetchImpl, URL, Promise });
  return { listeners, store, cache, caches, self, clients };
}
type Req = { url: string; method: string; mode: string };
type Res = { status: number; headers: { get: (k: string) => string | null }; clone: () => Res };
const res = (type: string): Res => { const r: Res = { status: 200, headers: { get: (k) => (k.toLowerCase() === "content-type" ? type : null) }, clone: () => r }; return r; };

async function fire(w: ReturnType<typeof loadWorker>, type: string, request?: Req) {
  let p: Promise<unknown> | undefined;
  const e = { request, respondWith: (x: Promise<unknown>) => { p = x; }, waitUntil: (x: Promise<unknown>) => { p = x; } };
  w.listeners[type](e);
  const out = await p; await new Promise((r) => setTimeout(r, 0)); return out;
}

describe("sw.js (worker side)", () => {
  it("does not cache an HTML fallback page under a script URL", async () => {
    // a host that answers missing files with index.html and 200 (Tauri, many SPA hosts)
    const w = loadWorker("example.app", async () => res("text/html"));
    await fire(w, "fetch", { url: "http://example.app/assets/index-OLD.js", method: "GET", mode: "cors" });
    expect(w.store.has("http://example.app/assets/index-OLD.js")).toBe(false);
  });

  it("still caches real scripts", async () => {
    const w = loadWorker("example.app", async () => res("text/javascript"));
    await fire(w, "fetch", { url: "http://example.app/assets/index-NEW.js", method: "GET", mode: "cors" });
    expect(w.store.has("http://example.app/assets/index-NEW.js")).toBe(true);
  });

  it("inside the Windows app it removes itself, clears its caches and reloads the window", async () => {
    const w = loadWorker("tauri.localhost", async () => res("text/html"));
    await fire(w, "activate");
    expect(w.caches.delete).toHaveBeenCalledWith("opennote-shell-v1");
    expect(w.self.registration.unregister).toHaveBeenCalled();
    const [client] = await w.clients.matchAll.mock.results[0].value;
    expect(client.navigate).toHaveBeenCalledWith("http://tauri.localhost/");
  });
});
