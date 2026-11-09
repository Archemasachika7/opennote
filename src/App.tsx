import { useSyncExternalStore } from "react";
import { ToastHost } from "./ui/Toast";
import { LibraryView } from "./library/LibraryView";
import { NotebookView } from "./notebook/NotebookView";

export type Route = { name: "library" } | { name: "notebook"; id: string; pageId?: string };

function parse(hash: string): Route {
  const m = /^#\/nb\/([^/?]+)(?:\?p=([^&]+))?/.exec(hash);
  if (!m) return { name: "library" };
  return m[2] ? { name: "notebook", id: decodeURIComponent(m[1]), pageId: decodeURIComponent(m[2]) }
    : { name: "notebook", id: decodeURIComponent(m[1]) };
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
        ? <LibraryView />
        : <NotebookView key={route.id} id={route.id} pageId={route.pageId} />}
      <ToastHost />
    </>
  );
}
