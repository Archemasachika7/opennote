import { Suspense, lazy, useEffect, useState, useSyncExternalStore } from "react";
import { ToastHost } from "./ui/Toast";
import { LibraryView } from "./library/LibraryView";
import { SettingsSheet } from "./ui/SettingsSheet";
import { CommandPalette } from "./ui/CommandPalette";
import { useLive } from "./store/useLive";
import { getNotebook } from "./store/notebooks";
import type { Notebook } from "./store/schema";

const NotebookView = lazy(() => import("./notebook/NotebookView").then((m) => ({ default: m.NotebookView })));
const WhiteboardView = lazy(() => import("./board/WhiteboardView").then((m) => ({ default: m.WhiteboardView })));
const StudySetView = lazy(() => import("./study/StudySetView").then((m) => ({ default: m.StudySetView })));

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
function DocView({ id, pageId, onOpenSettings }: { id: string; pageId?: string; onOpenSettings: () => void }) {
  const nb = useLive(async () => (await getNotebook(id)) ?? null, [id], undefined as Notebook | null | undefined);
  if (nb === undefined) return <main className="nb-loading dim">Loading...</main>;
  if (nb === null) {
    return (
      <main className="nb-missing">
        <h2>Notebook not found</h2>
        <p className="dim">This notebook does not exist on this device or may have been deleted.</p>
        <div className="row-end" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => navigate("/")}>Back to library</button>
        </div>
      </main>
    );
  }
  return (
    <Suspense fallback={<main className="nb-loading dim">Loading...</main>}>
      {nb.kind === "whiteboard" ? (
        <WhiteboardView id={id} pageId={pageId} onOpenSettings={onOpenSettings} />
      ) : nb.kind === "studyset" ? (
        <StudySetView id={id} onOpenSettings={onOpenSettings} />
      ) : (
        <NotebookView id={id} pageId={pageId} onOpenSettings={onOpenSettings} />
      )}
    </Suspense>
  );
}

export function App() {
  const route = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSettingsOpen(false);
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.("input, textarea, select, [contenteditable=true], .sheet")) return;
        e.preventDefault();
        setPaletteOpen(false);
        setSettingsOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {route.name === "library" ? (
        <LibraryView onOpenSettings={() => setSettingsOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
      ) : (
        <DocView key={route.id} id={route.id} pageId={route.pageId} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
        inNotebook={route.name !== "library"}
      />
      <ToastHost />
    </>
  );
}
