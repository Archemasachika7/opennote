import { useState } from "react";
import { FolderPlus, Plus, Search } from "lucide-react";
import { navigate } from "../App";
import { db, type Notebook } from "../store/schema";
import { createNotebook, deleteNotebook, listNotebooks, renameNotebook } from "../store/notebooks";
import { createFolder, listFolders } from "../store/folders";
import { searchAll, type SearchHit } from "../store/search";
import { useLive } from "../store/useLive";
import { platform } from "../platform/port";
import { Sheet } from "../ui/Sheet";
import { NotebookCard } from "./NotebookCard";
import "./library.css";

export function LibraryView() {
  const [folder, setFolder] = useState<string | null | undefined>(undefined);
  const [sort, setSort] = useState<"updated" | "title">("updated");
  const [q, setQ] = useState("");
  const [doomed, setDoomed] = useState<Notebook | null>(null);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");

  const notebooks = useLive(() => listNotebooks({ folderId: folder, sort }), [folder, sort], [] as Notebook[]);
  const folders = useLive(listFolders, [], []);
  const liveCounts = useLive(async () => {
    const m = new Map<string, number>();
    await db.pages.each((p) => { if (p.kind === "html") m.set(p.notebookId, (m.get(p.notebookId) ?? 0) + 1); });
    return m;
  }, [], new Map<string, number>());
  const hits = useLive(() => searchAll(q), [q], [] as SearchHit[]);

  async function newNotebook() {
    const isFirst = (await db.notebooks.count()) === 0;
    const nb = await createNotebook({ title: "Untitled notebook", folderId: folder ?? null });
    if (isFirst) void platform.requestPersistentStorage();
    navigate(`/nb/${nb.id}`);
  }

  return (
    <div className="library">
      <header className="lib-header">
        <h1 className="wordmark">OpenNote</h1>
        <label className="lib-search">
          <Search size={16} strokeWidth={1.5} aria-hidden />
          <input type="search" placeholder="Search notes and live pages" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn" onClick={() => setNaming(true)}><FolderPlus size={16} strokeWidth={1.5} />New folder</button>
        <button className="btn primary" onClick={newNotebook}><Plus size={16} strokeWidth={1.5} />New notebook</button>
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
              <button className={`chip ${folder === undefined ? "on" : ""}`} onClick={() => setFolder(undefined)}>All</button>
              <button className={`chip ${folder === null ? "on" : ""}`} onClick={() => setFolder(null)}>Unfiled</button>
              {folders.map((f) => (
                <button key={f.id} className={`chip ${folder === f.id ? "on" : ""}`} onClick={() => setFolder(f.id)}>{f.name}</button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setSort(sort === "updated" ? "title" : "updated")}>
              Sort: {sort === "updated" ? "Updated" : "Title"}
            </button>
          </nav>
          {notebooks.length === 0 ? (
            <div className="empty">
              <h2>No notebooks yet</h2>
              <p className="dim">Create one, then paste an AI artifact into it to make a live page.</p>
            </div>
          ) : (
            <section className="grid">
              {notebooks.map((nb) => (
                <NotebookCard key={nb.id} nb={nb} liveCount={liveCounts.get(nb.id) ?? 0}
                  onOpen={() => navigate(`/nb/${nb.id}`)}
                  onRename={(t) => renameNotebook(nb.id, t)}
                  onDelete={() => setDoomed(nb)} />
              ))}
            </section>
          )}
        </>
      )}

      <Sheet open={!!doomed} onClose={() => setDoomed(null)} title="Delete notebook" width={420}>
        <p>Delete <strong>{doomed?.title}</strong> and all its pages? This cannot be undone.</p>
        <div className="row-end">
          <button className="btn" onClick={() => setDoomed(null)}>Cancel</button>
          <button className="btn primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
            onClick={async () => { if (doomed) await deleteNotebook(doomed.id); setDoomed(null); }}>Delete</button>
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
