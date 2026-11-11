"use client";
import { blotReact } from "../ui/blotBus";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CheckSquare, ChevronDown, Command, FolderPlus, GraduationCap, LayoutDashboard, LayoutGrid, List,
  Pencil, Plus, Search, Settings, Sparkles, Star, Trash2, Upload, User, X,
} from "lucide-react";
import { AccountSheet } from "../ui/AccountSheet";
import { useAuth } from "../sync/auth";
import { navigate } from "../App";
import { db, type DocKind, type Folder, type Notebook } from "../store/schema";
import { Menu } from "../ui/Menu";
import {
  createNotebook, listNotebooks, moveNotebooks, purgeTrash, renameNotebook, restoreNotebook,
  setFavorite, toggleFavorite, trashNotebook, updateNotebook, type LibrarySort,
} from "../store/notebooks";
import { createFolder, deleteFolder, listFolders, renameFolder } from "../store/folders";
import { searchAll, type SearchHit } from "../store/search";
import { useLive } from "../store/useLive";
import { platform } from "../platform/port";
import { Sheet } from "../ui/Sheet";
import { motionTokens, springs } from "../ui/motion";
import { NotebookCard } from "./NotebookCard";
import { DeleteSheet } from "./DeleteSheet";
import { LockSheet } from "./LockSheet";
import { createStarterNotebook } from "./demoNotebook";
import { importFile } from "../io/importFile";
import { toast } from "../ui/Toast";
import { highlightText } from "../ui/highlight";
import "./library.css";

type Filter = { kind: "all" } | { kind: "favorites" } | { kind: "trash" } | { kind: "folder"; id: string | null } | { kind: "type"; doc: DocKind };
const I = { size: 16, strokeWidth: 1.5 } as const;

function ago(t: number, nowMs: number = Date.now()): string {
  const m = Math.round((nowMs - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function savedView(): "grid" | "list" {
  try { return localStorage.getItem("opennote:libraryView") === "list" ? "list" : "grid"; } catch { return "grid"; }
}

export function LibraryView({ onOpenSettings, onOpenPalette }: { onOpenSettings?: () => void; onOpenPalette?: () => void } = {}) {
  const auth = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sort, setSort] = useState<LibrarySort>("updated");
  const [view, setViewRaw] = useState<"grid" | "list">(savedView);
  const [q, setQ] = useState("");
  const [doomed, setDoomed] = useState<Notebook[] | null>(null);
  const [lockFor, setLockFor] = useState<Notebook | null>(null);
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
  const reduceMotion = useReducedMotion() ?? false;
  const notebooks = useLive(() => listNotebooks({
    sort,
    view: filter.kind === "favorites" ? "favorites" : inTrash ? "trash" : "all",
    folderId: filter.kind === "folder" ? filter.id : undefined,
    kind: filter.kind === "type" ? filter.doc : undefined,
  }), [filter, sort], [] as Notebook[]);
  // the "Continue" row: last three edited, whatever the sort
  const recent = [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
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
    blotReact("peek");
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
    <button className={`chip ${on ? "on" : ""}`} onClick={() => pick(f)}>
      {/* one highlight that slides to the chosen section (shown in the sidebar layout only) */}
      {on && <motion.span className="lib-pill" layoutId="lib-section-pill" aria-hidden
        transition={reduceMotion ? { duration: 0 } : springs.snappy} />}
      {icon}{label}
    </button>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
          <h1 className="wordmark" style={{ marginRight: 0 }}>OpenNote</h1>
          <button
            type="button"
            className="btn ghost"
            aria-label="Product overview"
            title="View OpenNote overview & interactive playground"
            style={{ height: 24, padding: "0 8px", fontSize: 11.5, color: "var(--text-dim)" }}
            onClick={() => navigate("/welcome")}>
            Overview
          </button>
        </div>
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
          {auth.status !== "disabled" && (
            <>
              <button className={`btn ghost icon${auth.status === "signed-in" ? " active" : ""}`} aria-label="Account"
                title={auth.user ? `Signed in as ${auth.user.email}` : "Account (optional)"} onClick={() => setAccountOpen(true)}>
                <User {...I} />
              </button>
              <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
            </>
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
        <div className="lib-body">
          <aside className="lib-side" aria-label="Library sections">
            <div className="chips">
              {chip("All", { kind: "all" }, filter.kind === "all")}
              {chip("Favourites", { kind: "favorites" }, filter.kind === "favorites", <Star size={13} strokeWidth={1.5} />)}
              {chip("Whiteboards", { kind: "type", doc: "whiteboard" }, filter.kind === "type" && filter.doc === "whiteboard", <LayoutDashboard size={13} strokeWidth={1.5} />)}
              {chip("Study sets", { kind: "type", doc: "studyset" }, filter.kind === "type" && filter.doc === "studyset", <GraduationCap size={13} strokeWidth={1.5} />)}
              {chip("Unfiled", { kind: "folder", id: null }, filter.kind === "folder" && filter.id === null)}
              {folders.map((f) => <span key={f.id}>{chip(f.name, { kind: "folder", id: f.id }, filter.kind === "folder" && filter.id === f.id)}</span>)}
              {chip("Trash", { kind: "trash" }, inTrash, <Trash2 size={13} strokeWidth={1.5} />)}
            </div>
          </aside>
          <div className="lib-main">
          <nav className="lib-bar" aria-label="Filters and sort">
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
                    <button className="btn" disabled={!ids.length} aria-label="Delete options for selected"
                      onClick={() => setDoomed(notebooks.filter((n) => selected.has(n.id)))}>Delete…</button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* with a handful of notebooks the grid below already shows them all; the row would only repeat it */}
          {filter.kind === "all" && !selecting && notebooks.length >= 6 && (
            <section className="lib-continue" aria-label="Continue where you left off">
              <h2 className="lib-continue-title">Continue</h2>
              <div className="lib-continue-row">
                {recent.map((nb, i) => (
                  <motion.button key={nb.id} type="button" className="lib-continue-card"
                    aria-label={`Continue ${nb.title}`}
                    initial={{ opacity: 0, y: motionTokens.distance.sm }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: motionTokens.duration.normal, delay: i * motionTokens.stagger }}
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/nb/${nb.id}`)}>
                    <span className="lib-continue-cover" style={{ background: nb.coverColor }} aria-hidden />
                    <span className="lib-continue-meta">
                      <strong>{nb.title}</strong>
                      <span className="dim small">{nb.pageIds.length} {nb.pageIds.length === 1 ? "page" : "pages"} · {ago(nb.updatedAt)}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </section>
          )}

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
                    onDeleteForever={() => setDoomed([nb])}
                    onLock={nb.kind === "studyset" ? undefined : () => setLockFor(nb)} />
                ))}
              </AnimatePresence>
            </motion.section>
          )}
          </div>
        </div>
      )}

      <LockSheet notebook={lockFor} onClose={() => setLockFor(null)} />
      <DeleteSheet notebooks={doomed} inTrash={inTrash} onClose={() => setDoomed(null)} onDone={endSelect} />

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
