"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckSquare, ChevronDown, Command, FolderPlus, GraduationCap, LayoutDashboard, LayoutGrid, List,
  Pencil, Plus, Search, Settings, Sparkles, Star, Trash2, Upload, X,
} from "lucide-react";
import { navigate } from "../App";
import { db, type DocKind, type Folder, type Notebook } from "../store/schema";
import { Menu } from "../ui/Menu";
import {
  createNotebook, deleteNotebook, listNotebooks, moveNotebooks, purgeTrash, renameNotebook, restoreNotebook,
  setFavorite, toggleFavorite, trashNotebook, updateNotebook, type LibrarySort,
} from "../store/notebooks";
import { createFolder, deleteFolder, listFolders, renameFolder } from "../store/folders";
import { searchAll, type SearchHit } from "../store/search";
import { useLive } from "../store/useLive";
import { platform } from "../platform/port";
import { Sheet } from "../ui/Sheet";
import { motionTokens } from "../ui/motion";
import { NotebookCard } from "./NotebookCard";
import { createStarterNotebook } from "./demoNotebook";
import { importFile } from "../io/importFile";
import { toast } from "../ui/Toast";
import { highlightText } from "../ui/highlight";
import "./library.css";

type Filter = { kind: "all" } | { kind: "favorites" } | { kind: "trash" } | { kind: "folder"; id: string | null } | { kind: "type"; doc: DocKind };
const I = { size: 16, strokeWidth: 1.5 } as const;

function savedView(): "grid" | "list" {
  try { return localStorage.getItem("opennote:libraryView") === "list" ? "list" : "grid"; } catch { return "grid"; }
}

export function LibraryView({ onOpenSettings, onOpenPalette }: { onOpenSettings?: () => void; onOpenPalette?: () => void } = {}) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sort, setSort] = useState<LibrarySort>("updated");
  const [view, setViewRaw] = useState<"grid" | "list">(savedView);
  const [q, setQ] = useState("");
  const [doomed, setDoomed] = useState<Notebook[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editFolderDraft, setEditFolderDraft] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importJob, setImportJob] = useState<{ name: string; done: number; total: number } | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => { void purgeTrash(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true], .sheet")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const setView = (v: "grid" | "list") => { setViewRaw(v); try { localStorage.setItem("opennote:libraryView", v); } catch { /* private mode */ } };

  const inTrash = filter.kind === "trash";
  const notebooks = useLive(() => listNotebooks({
    sort,
    view: filter.kind === "favorites" ? "favorites" : inTrash ? "trash" : "all",
    folderId: filter.kind === "folder" ? filter.id : undefined,
    kind: filter.kind === "type" ? filter.doc : undefined,
  }), [filter, sort], [] as Notebook[]);
  const cardCounts = useLive(async () => {
    const m = new Map<string, number>();
    await db.cards.each((c) => m.set(c.notebookId, (m.get(c.notebookId) ?? 0) + 1));
    return m;
  }, [], new Map<string, number>());
  const [newMenu, setNewMenu] = useState(false);
  const folders = useLive(listFolders, [], []);
  const folderMap = new Map(folders.map((f) => [f.id, f.name]));
  const activeFolder = filter.kind === "folder" && filter.id ? folders.find((f) => f.id === filter.id) ?? null : null;

  const liveCounts = useLive(async () => {
    const m = new Map<string, number>();
    await db.pages.each((p) => { if (p.kind === "html") m.set(p.notebookId, (m.get(p.notebookId) ?? 0) + 1); });
    return m;
  }, [], new Map<string, number>());
  const hits = useLive(() => searchAll(q), [q], [] as SearchHit[]);

  async function newNotebook(kind: DocKind = "notebook") {
    const isFirst = (await db.notebooks.count()) === 0;
    const title = kind === "whiteboard" ? "Untitled whiteboard" : kind === "studyset" ? "Untitled study set" : "Untitled notebook";
    const nb = await createNotebook({ title, kind, folderId: filter.kind === "folder" ? filter.id : null });
    if (isFirst) void platform.requestPersistentStorage();
    navigate(`/nb/${nb.id}`);
  }

  async function runImport(file: File) {
    setImportJob({ name: file.name, done: 0, total: 0 });
    try {
      const nb = await importFile(file, (done, total) => setImportJob({ name: file.name, done, total }));
      toast(`Imported "${nb.title}"`, { label: "Open", run: () => navigate(`/nb/${nb.id}`) });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setImportJob(null);
    }
  }

  async function pickAndImport() {
    const f = await platform.openFile([".opennote", ".pdf", "application/pdf"]);
    if (!f) return;
    await runImport(f);
  }

  async function moveToTrashWithUndo(nb: Notebook) {
    await trashNotebook(nb.id);
    toast(`Moved "${nb.title}" to Trash`, { label: "Undo", run: () => { void restoreNotebook(nb.id); } });
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const endSelect = () => { setSelecting(false); setSelected(new Set()); };
  const pick = (f: Filter) => { setFilter(f); endSelect(); };
  const chip = (label: string, f: Filter, on: boolean, icon?: JSX.Element) => (
    <button className={`chip ${on ? "on" : ""}`} onClick={() => pick(f)}>{icon}{label}</button>
  );
  const ids = [...selected];

  return (
    <div
      className={`library ${draggingFile ? "drop-active" : ""}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        dragDepth.current += 1;
        setDraggingFile(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDraggingFile(false);
      }}
      onDrop={async (e) => {
        dragDepth.current = 0;
        setDraggingFile(false);
        const files = [...(e.dataTransfer?.files ?? [])];
        if (files.length === 0) return;
        e.preventDefault();
        for (const f of files) await runImport(f);
      }}>
      {draggingFile && (
        <div className="lib-dropzone" aria-hidden>
          <div className="lib-dropzone-box">
            <Upload size={22} strokeWidth={1.5} />
            <strong>Drop PDF or .opennote backup to import</strong>
            <span className="dim small">Files stay 100% on your device</span>
          </div>
        </div>
      )}

      <header className="lib-header">
        <h1 className="wordmark">OpenNote</h1>
        <label className="lib-search">
          <Search {...I} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search notes and live pages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
          />
          {q ? (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}>
              <X size={13} strokeWidth={1.5} />
            </button>
          ) : (
            <kbd className="kbd mono search-hint" aria-hidden>/</kbd>
          )}
        </label>
        <div className="lib-actions">
          {onOpenPalette && (
            <button className="btn ghost icon" aria-label="Command palette" title="Command palette (Ctrl+K)" onClick={onOpenPalette}>
              <Command {...I} />
            </button>
          )}
          {onOpenSettings && (
            <button className="btn ghost icon" aria-label="Settings" title="Settings, storage & shortcuts (?)" onClick={onOpenSettings}>
              <Settings {...I} />
            </button>
          )}
          <button className="btn" disabled={!!importJob} onClick={pickAndImport}><Upload {...I} />Import</button>
          <button className="btn" onClick={() => setNaming(true)}><FolderPlus {...I} />New folder</button>
          <div className="split-btn" style={{ position: "relative" }}>
            <button className="btn primary" onClick={() => newNotebook()}><Plus {...I} />New notebook</button>
            <button className="btn primary icon" aria-label="More new items" aria-haspopup="menu" onClick={() => setNewMenu(true)}><ChevronDown {...I} /></button>
            {newMenu && (
              <Menu onClose={() => setNewMenu(false)} style={{ right: 0, top: 38 }} items={[
                { label: "New whiteboard", icon: <LayoutDashboard size={14} strokeWidth={1.5} />, onSelect: () => newNotebook("whiteboard") },
                { label: "New study set", icon: <GraduationCap size={14} strokeWidth={1.5} />, onSelect: () => newNotebook("studyset") },
              ]} />
            )}
          </div>
        </div>
      </header>

      {importJob && (
        <div className="import-banner" role="status">
          <div className="import-banner-row">
            <span>Importing <strong>{importJob.name}</strong></span>
            <span className="mono dim small">
              {importJob.total > 0 ? `${importJob.done} / ${importJob.total} pages` : "Preparing..."}
            </span>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: importJob.total > 0 ? `${Math.round((importJob.done / importJob.total) * 100)}%` : "25%" }} />
          </div>
        </div>
      )}

      {q.trim() ? (
        <section className="lib-results" aria-label="Search results">
          {hits.length === 0 && <p className="dim">No matches.</p>}
          {hits.map((h, i) => (
            <button key={i} className="hit" onClick={() => navigate(`/nb/${h.notebookId}${h.pageId ? `?p=${h.pageId}` : ""}`)}>
              <span className="hit-head">
                <span className="hit-title">{h.title}</span>
                {h.kind && (
                  <span className={`cmd-badge mono ${h.kind === "live" ? "live" : ""}`}>
                    {h.kind === "live" ? "LIVE" : h.kind.toUpperCase()}
                  </span>
                )}
              </span>
              <span className="hit-snippet dim">{highlightText(h.snippet, q)}</span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <nav className="lib-bar" aria-label="Filters and sort">
            <div className="chips">
              {chip("All", { kind: "all" }, filter.kind === "all")}
              {chip("Favourites", { kind: "favorites" }, filter.kind === "favorites", <Star size={13} strokeWidth={1.5} />)}
              {chip("Whiteboards", { kind: "type", doc: "whiteboard" }, filter.kind === "type" && filter.doc === "whiteboard", <LayoutDashboard size={13} strokeWidth={1.5} />)}
              {chip("Study sets", { kind: "type", doc: "studyset" }, filter.kind === "type" && filter.doc === "studyset", <GraduationCap size={13} strokeWidth={1.5} />)}
              {chip("Unfiled", { kind: "folder", id: null }, filter.kind === "folder" && filter.id === null)}
              {folders.map((f) => <span key={f.id}>{chip(f.name, { kind: "folder", id: f.id }, filter.kind === "folder" && filter.id === f.id)}</span>)}
              {chip("Trash", { kind: "trash" }, inTrash, <Trash2 size={13} strokeWidth={1.5} />)}
            </div>
            <div className="lib-tools">
              {activeFolder && (
                <div className="folder-actions">
                  <button className="btn ghost icon" aria-label={`Rename folder ${activeFolder.name}`} title="Rename folder"
                    onClick={() => { setEditingFolder(activeFolder); setEditFolderDraft(activeFolder.name); }}>
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  <button className="btn ghost icon" aria-label={`Delete folder ${activeFolder.name}`} title="Delete folder (keeps notebooks)"
                    onClick={() => setDeletingFolder(activeFolder)}>
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              )}
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
                    <button className="btn" disabled={!ids.length} onClick={async () => { await setFavorite(ids, true); endSelect(); }}>
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
              <h2>
                {inTrash ? "Trash is empty"
                  : filter.kind === "favorites" ? "No favourites yet"
                  : activeFolder ? `No items in "${activeFolder.name}"`
                  : "No notebooks yet"}
              </h2>
              <p className="dim">
                {inTrash ? "Deleted notebooks stay here for 30 days."
                  : filter.kind === "favorites" ? "Star any notebook, whiteboard, or study set for quick access."
                  : "Create one, then paste an AI artifact into it to make a live page."}
              </p>
              {!inTrash && filter.kind !== "favorites" && (
                <div className="empty-actions">
                  <button className="btn primary" onClick={() => newNotebook()}><Plus {...I} />Create blank</button>
                  <button className="btn" onClick={async () => {
                    const nb = await createStarterNotebook();
                    void platform.requestPersistentStorage();
                    navigate(`/nb/${nb.id}`);
                  }}>
                    <Sparkles size={15} strokeWidth={1.5} color="var(--live)" />Explore starter demo
                  </button>
                  <button className="btn ghost" onClick={pickAndImport}><Upload {...I} />Open PDF or backup</button>
                </div>
              )}
            </div>
          ) : (
            <motion.section className={view === "grid" ? "grid" : "list"} data-view={view} initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: motionTokens.stagger } } }}>
              <AnimatePresence mode="popLayout">
                {notebooks.map((nb) => (
                  <NotebookCard key={nb.id} nb={nb} view={view} inTrash={inTrash}
                    liveCount={liveCounts.get(nb.id) ?? 0}
                    cardCount={cardCounts.get(nb.id) ?? 0}
                    folderName={filter.kind !== "folder" && nb.folderId ? folderMap.get(nb.folderId) : undefined}
                    selecting={selecting} selected={selected.has(nb.id)} onToggleSelect={() => toggle(nb.id)}
                    onOpen={() => navigate(`/nb/${nb.id}`)}
                    onRename={(t) => renameNotebook(nb.id, t)}
                    onCoverColor={(coverColor) => updateNotebook(nb.id, { coverColor })}
                    onTrash={() => moveToTrashWithUndo(nb)}
                    onFavorite={() => toggleFavorite(nb.id)}
                    onRestore={() => restoreNotebook(nb.id)}
                    onDeleteForever={() => setDoomed([nb])} />
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
          <div className="row-end">
            <button className="btn" type="button" onClick={() => setNaming(false)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={!folderName.trim()}>Create</button>
          </div>
        </form>
      </Sheet>

      <Sheet open={!!editingFolder} onClose={() => setEditingFolder(null)} title="Rename folder" width={420}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (editingFolder && editFolderDraft.trim()) await renameFolder(editingFolder.id, editFolderDraft.trim());
          setEditingFolder(null);
        }}>
          <input className="input" style={{ width: "100%" }} aria-label="Folder name" autoFocus value={editFolderDraft}
            onChange={(e) => setEditFolderDraft(e.target.value)} />
          <div className="row-end">
            <button className="btn" type="button" onClick={() => setEditingFolder(null)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={!editFolderDraft.trim()}>Save</button>
          </div>
        </form>
      </Sheet>

      <Sheet open={!!deletingFolder} onClose={() => setDeletingFolder(null)} title="Delete folder" width={440}>
        <p>Delete folder <strong>{deletingFolder?.name}</strong>? Notebooks inside will stay safe and move to Unfiled.</p>
        <div className="row-end">
          <button className="btn" onClick={() => setDeletingFolder(null)}>Cancel</button>
          <button className="btn danger" onClick={async () => {
            if (deletingFolder) {
              await deleteFolder(deletingFolder.id);
              setFilter({ kind: "all" });
              toast(`Deleted folder "${deletingFolder.name}"`);
            }
            setDeletingFolder(null);
          }}>Delete folder</button>
        </div>
      </Sheet>
    </div>
  );
}
