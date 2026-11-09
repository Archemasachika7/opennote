import { useSyncExternalStore } from "react";
import { ToastHost } from "./ui/Toast";

export type Route = { name: "library" } | { name: "notebook"; id: string };

function parse(hash: string): Route {
  const m = /^#\/nb\/([^/?]+)/.exec(hash);
  return m ? { name: "notebook", id: decodeURIComponent(m[1]) } : { name: "library" };
}

let cached: { hash: string; route: Route } | null = null;
function snapshot(): Route {
  const hash = window.location.hash;
  if (!cached || cached.hash !== hash) cached = { hash, route: parse(hash) };
  return cached.route;
}
function subscribe(f: () => void) {
  window.addEventListener("hashchange", f);
  return () => window.removeEventListener("hashchange", f);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

export function App() {
  const route = useRoute();
  return (
    <>
      {route.name === "library"
        ? <main style={{ padding: 24 }}><h1>OpenNote</h1></main>
        : <main style={{ padding: 24 }}><h1>Notebook</h1></main>}
      <ToastHost />
    </>
  );
}
