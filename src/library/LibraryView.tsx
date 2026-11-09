"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckSquare, FolderPlus, LayoutGrid, List, Plus, Search, Star, Trash2, X } from "lucide-react";
import { navigate } from "../App";
import { db, type Notebook } from "../store/schema";
import {
  createNotebook, deleteNotebook, listNotebooks, moveNotebooks, purgeTrash, renameNotebook, restoreNotebook,
  toggleFavorite, trashNotebook, type LibrarySort,
} from "../store/notebooks";
import { createFolder, listFolders } from "../store/folders";
import { searchAll, type SearchHit } from "../store/search";
import { useLive } from "../store/useLive";
import { platform } from "../platform/port";
import { Sheet } from "../ui/Sheet";
import { motionTokens } from "../ui/motion";
import { NotebookCard } from "./NotebookCard";
import "./library.css";

type Filter = { kind: "all" } | { kind: "favorites" } | { kind: "trash" } | { kind: "folder"; id: string | null };
const I = { size: 16, strokeWidth: 1.5 } as const;

function savedView(): "grid" | "list" {
  try { return localStorage.getItem("opennote:libraryView") === "list" ? "list" : "grid"; } catch { return "grid"; }
}

export function LibraryView() {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sort, setSort] = useState<LibrarySort>("updated");
  const [view, setViewRaw] = useState<"grid" | "list">(savedView);
  const [q, setQ] = useState("");
  const [doomed, setDoomed] = useState<Notebook[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { void purgeTrash(); }, []);
  const setView = (v: "grid" | "list") => { setViewRaw(v); try { localStorage.setItem("opennote:libraryView", v); } catch { /* private mode */ } };

  const inTrash = filter.kind === "trash";
  const notebooks = useLive(() => listNotebooks({
    sort,
    view: filter.kind === "favorites" ? "favorites" : inTrash ? "trash" : "all",
    folderId: filter.kind === "folder" ? filter.id : undefined,
  }), [filter, sort], [] as Notebook[]);
  const folders = useLive(listFolders, [], []);
  const liveCounts = useLive(async () => {
    const m = new Map<string, number>();
    await db.pages.each((p) => { if (p.kind === "html") m.set(p.notebookId, (m.get(p.notebookId) ?? 0) + 1); });
    return m;
  }, [], new Map<string, number>());
  const hits = useLive(() => searchAll(q), [q], [] as SearchHit[]);

  async function newNotebook() {
    const isFirst = (await db.notebooks.count()) === 0;
    const nb = await createNotebook({ title: "Untitled notebook", folderId: filter.kind === "folder" ? filter.id : null });
    if (isFirst) void platform.requestPersistentStorage();
    navigate(`/nb/${nb.id}`);
  }
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const endSelect = () => { setSelecting(false); setSelected(new Set()); };
  const pick = (f: Filter) => { setFilter(f); endSelect(); };
  const chip = (label: string, f: Filter, on: boolean, icon?: JSX.Element) => (
    <button className={`chip ${on ? "on" : ""}`} onClick={() => pick(f)}>{icon}{label}</button>
  );
  const ids = [...selected];

  return (
    <div className="library">
      <header className="lib-header">
        <h1 className="wordmark">OpenNote</h1>
        <label className="lib-search">
          <Search {...I} aria-hidden />
          <input type="search" placeholder="Search notes and live pages" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn" onClick={() => setNaming(true)}><FolderPlus {...I} />New folder</button>
        <button className="btn primary" onClick={newNotebook}><Plus {...I} />New notebook</button>
      </header>

      {q.trim() ? (
        <section className="lib-results" aria-label="Search results">
          {hits.length === 0 && <p className="dim">No matches.</p>}
          {hits.map((h, i) => (
            <button key={i} className="hit" onClick={() => navigate(`/nb/${h.notebookId}${h.pageId ? `?p=${h.pageId}` : ""}`)}>
              <span className="hit-title">{h.title}</span>
              <span className="hit-snippet dim">{h.snippet}</span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <nav className="lib-bar">
            <div className="chips">
              {chip("All", { kind: "all" }, filter.kind === "all")}
              {chip("Favourites", { kind: "favorites" }, filter.kind === "favorites", <Star size={13} strokeWidth={1.5} />)}
              {chip("Unfiled", { kind: "folder", id: null }, filter.kind === "folder" && filter.id === null)}
              {folders.map((f) => <span key={f.id}>{chip(f.name, { kind: "folder", id: f.id }, filter.kind === "folder" && filter.id === f.id)}</span>)}
              {chip("Trash", { kind: "trash" }, inTrash, <Trash2 size={13} strokeWidth={1.5} />)}
            </div>
            <div className="lib-tools">
              {!inTrash && (
                <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
                  <option value="updated">Last modified</option>
                  <option value="created">Date created</option>
                  <option value="title">Name</option>
                  <option value="pages">Most pages</option>
                </select>
              )}
              <div className="seg" role="group" aria-label="View">
                <button className={`btn ghost icon ${view === "grid" ? "active" : ""}`} aria-label="Grid view" onClick={() => setView("grid")}><LayoutGrid {...I} /></button>
                <button className={`btn ghost icon ${view === "list" ? "active" : ""}`} aria-label="List view" onClick={() => setView("list")}><List {...I} /></button>
              </div>
              <button className={`btn ghost ${selecting ? "active" : ""}`} onClick={() => (selecting ? endSelect() : setSelecting(true))}>
                {selecting ? <X {...I} /> : <CheckSquare {...I} />}{selecting ? "Done" : "Select"}
              </button>
            </div>
          </nav>

          <AnimatePresence>
            {selecting && (
              <motion.div key="bulk" className="bulk-bar" initial={{ opacity: 0, y: -motionTokens.distance.sm }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -motionTokens.distance.sm }} transition={{ duration: motionTokens.duration.fast }}>
                <span>{selected.size} selected</span>
                {inTrash ? (
                  <>
                    <button className="btn" disabled={!ids.length} onClick={async () => { for (const id of ids) await restoreNotebook(id); endSelect(); }}>Restore</button>
                    <button className="btn" disabled={!ids.length} aria-label="Delete selected forever"
                      onClick={() => setDoomed(notebooks.filter((n) => selected.has(n.id)))}>Delete forever</button>
                  </>
                ) : (
                  <>
                    <select className="input" aria-label="Move selected to folder" disabled={!ids.length} value=""
                      onChange={async (e) => { await moveNotebooks(ids, e.target.value === "__none" ? null : e.target.value); endSelect(); }}>
                      <option value="" disabled>Move to folder...</option>
                      <option value="__none">Unfiled</option>
                      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button className="btn" disabled={!ids.length} onClick={async () => { for (const id of ids) await toggleFavorite(id); endSelect(); }}>
                      <Star {...I} />Favourite</button>
                    <button className="btn" disabled={!ids.length} aria-label="Move selected to Trash"
                      onClick={async () => { for (const id of ids) await trashNotebook(id); endSelect(); }}><Trash2 {...I} />Trash</button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {notebooks.length === 0 ? (
            <div className="empty">
              <h2>{inTrash ? "Trash is empty" : filter.kind === "favorites" ? "No favourites yet" : "No notebooks yet"}</h2>
              <p className="dim">{inTrash ? "Deleted notebooks stay here for 30 days." : "Create one, then paste an AI artifact into it to make a live page."}</p>
            </div>
          ) : (
            <motion.section className={view === "grid" ? "grid" : "list"} data-view={view} initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: motionTokens.stagger } } }}>
              <AnimatePresence mode="popLayout">
                {notebooks.map((nb) => (
                  <NotebookCard key={nb.id} nb={nb} view={view} inTrash={inTrash} liveCount={liveCounts.get(nb.id) ?? 0}
                    selecting={selecting} selected={selected.has(nb.id)} onToggleSelect={() => toggle(nb.id)}
                    onOpen={() => navigate(`/nb/${nb.id}`)} onRename={(t) => renameNotebook(nb.id, t)}
                    onTrash={() => trashNotebook(nb.id)} onFavorite={() => toggleFavorite(nb.id)}
                    onRestore={() => restoreNotebook(nb.id)} onDeleteForever={() => setDoomed([nb])} />
                ))}
              </AnimatePresence>
            </motion.section>
          )}
        </>
      )}

      <Sheet open={!!doomed} onClose={() => setDoomed(null)} title="Delete forever" width={440}>
        <p>Permanently delete {doomed?.length === 1 ? <strong>{doomed[0].title}</strong> : `${doomed?.length ?? 0} notebooks`} and all pages? This cannot be undone.</p>
        <div className="row-end">
          <button className="btn" onClick={() => setDoomed(null)}>Cancel</button>
          <button className="btn danger" onClick={async () => {
            for (const n of doomed ?? []) await deleteNotebook(n.id);
            setDoomed(null); endSelect();
          }}>Delete forever</button>
        </div>
      </Sheet>

      <Sheet open={naming} onClose={() => setNaming(false)} title="New folder" width={420}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (folderName.trim()) await createFolder(folderName.trim());
          setFolderName(""); setNaming(false);
        }}>
          <input className="input" style={{ width: "100%" }} aria-label="Folder name" autoFocus value={folderName}
            onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Semester 3" />
          <div className="row-end"><button className="btn primary" type="submit">Create</button></div>
        </form>
      </Sheet>
    </div>
  );
}
