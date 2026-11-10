// OpenNote offline cache, for the website only.
// v2: v1 could store an index.html fallback under a script URL (hosts answer missing files with the page),
// which left the app blank after an update; activate() drops every older cache.
const CACHE = "opennote-shell-v2";
const PRECACHE = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];

// Inside the Windows (Tauri) or Android (Capacitor) app every file is local and this worker only does harm:
// it removes itself, clears its caches and reloads the window from the app's own files.
const IN_APP = self.location.hostname === "tauri.localhost" || (self.location.hostname === "localhost" && self.location.protocol === "https:");

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (IN_APP) return;
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  if (IN_APP) {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.matchAll({ type: "window" }))
        .then((list) => Promise.all(list.map((c) => c.navigate(c.url))))
        .catch(() => undefined),
    );
    return;
  }
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isHtml = (res) => (res.headers.get("content-type") || "").includes("text/html");

self.addEventListener("fetch", (event) => {
  if (IN_APP) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          // never keep a page under a file's URL: that is a host's "not found" fallback, not the file
          if (res && res.status === 200 && !isHtml(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
