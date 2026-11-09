import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Notebook } from "../store/schema";
import { Menu } from "../ui/Menu";

export function NotebookCard({ nb, liveCount, onOpen, onRename, onDelete }: {
  nb: Notebook; liveCount: number; onOpen: () => void; onRename: (title: string) => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nb.title);
  return (
    <article className="nb-card">
      <button className="nb-cover" onClick={onOpen} aria-label={`Open ${nb.title}`}>
        <span className="nb-spine" style={{ background: nb.coverColor }} />
        <span className="nb-pages mono">{nb.pageIds.length} {nb.pageIds.length === 1 ? "page" : "pages"}</span>
        {liveCount > 0 && <span className="live-tag mono">LIVE {liveCount}</span>}
      </button>
      <footer className="nb-meta">
        {editing ? (
          <input className="input" aria-label="Notebook name" autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft.trim()) onRename(draft.trim()); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setDraft(nb.title); setEditing(false); }
            }} />
        ) : (
          <span className="nb-title" data-testid="nb-title">{nb.title}</span>
        )}
        <div style={{ position: "relative" }}>
          <button className="btn ghost icon" aria-label={`More for ${nb.title}`} onClick={() => setMenu(true)}>
            <MoreHorizontal size={16} strokeWidth={1.5} />
          </button>
          {menu && (
            <Menu onClose={() => setMenu(false)} style={{ right: 0, top: 34 }} items={[
              { label: "Rename", icon: <Pencil size={14} strokeWidth={1.5} />, onSelect: () => { setDraft(nb.title); setEditing(true); } },
              { label: "Delete", icon: <Trash2 size={14} strokeWidth={1.5} />, danger: true, onSelect: onDelete },
            ]} />
          )}
        </div>
      </footer>
    </article>
  );
}
