import { useSyncExternalStore } from "react";
import { ToastHost } from "./ui/Toast";
import { LibraryView } from "./library/LibraryView";
import { NotebookView } from "./notebook/NotebookView";
import { WhiteboardView } from "./board/WhiteboardView";
import { StudySetView } from "./study/StudySetView";
import { useLive } from "./store/useLive";
import { getNotebook } from "./store/notebooks";
import type { Notebook } from "./store/schema";

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

/** Opens a document in the view for its type: notebook, whiteboard or study set. */
function DocView({ id, pageId }: { id: string; pageId?: string }) {
  // undefined = still loading; null = not found (NotebookView shows its loading state then)
  const nb = useLive(async () => (await getNotebook(id)) ?? null, [id], undefined as Notebook | null | undefined);
  if (nb === undefined) return <main className="nb-loading dim">Loading...</main>;
  if (nb?.kind === "whiteboard") return <WhiteboardView id={id} pageId={pageId} />;
  if (nb?.kind === "studyset") return <StudySetView id={id} />;
  return <NotebookView id={id} pageId={pageId} />;
}

export function App() {
  const route = useRoute();
  return (
    <>
      {route.name === "library"
        ? <LibraryView />
        : <DocView key={route.id} id={route.id} pageId={route.pageId} />}
      <ToastHost />
    </>
  );
}
