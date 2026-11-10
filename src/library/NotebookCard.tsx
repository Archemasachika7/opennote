"use client";
import { forwardRef, useState } from "react";
import { motion } from "motion/react";
import { MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import type { Notebook } from "../store/schema";
import { Menu, type MenuItem } from "../ui/Menu";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";

const I = { size: 14, strokeWidth: 1.5 } as const;

type NotebookCardProps = {
  nb: Notebook; liveCount: number; cardCount?: number; view: "grid" | "list"; inTrash: boolean;
  selecting: boolean; selected: boolean; onToggleSelect: () => void;
  onOpen: () => void; onRename: (title: string) => void; onTrash: () => void; onFavorite: () => void;
  onRestore: () => void; onDeleteForever: () => void;
};

// forwardRef: the library list animates cards out with AnimatePresence "popLayout", which needs a ref
export const NotebookCard = forwardRef<HTMLElement, NotebookCardProps>(function NotebookCard({ nb, liveCount, cardCount = 0, view, inTrash, selecting, selected, onToggleSelect, onOpen, onRename, onTrash, onFavorite, onRestore, onDeleteForever }, ref) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nb.title);
  const safe = useSafeMotion(motionTokens.distance.md);
  const items: MenuItem[] = inTrash
    ? [
      { label: "Restore", icon: <RotateCcw {...I} />, onSelect: onRestore },
      { label: "Delete forever", icon: <Trash2 {...I} />, danger: true, onSelect: onDeleteForever },
    ]
    : [
      { label: "Rename", icon: <Pencil {...I} />, onSelect: () => { setDraft(nb.title); setEditing(true); } },
      { label: nb.favorite ? "Remove from Favourites" : "Add to Favourites", icon: <Star {...I} />, onSelect: onFavorite },
      { label: "Move to Trash", icon: <Trash2 {...I} />, danger: true, onSelect: onTrash },
    ];
  const open = () => (selecting ? onToggleSelect() : inTrash ? undefined : onOpen());
  const daysLeft = nb.trashedAt ? Math.max(0, 30 - Math.floor((Date.now() - nb.trashedAt) / 864e5)) : 0;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const pages = nb.kind === "studyset" ? count(cardCount, "card", "cards")
    : nb.kind === "whiteboard" ? count(nb.pageIds.length, "board", "boards")
    : count(nb.pageIds.length, "page", "pages");
  const kindTag = nb.kind === "studyset" ? "STUDY" : nb.kind === "whiteboard" ? "BOARD" : null;
  return (
    <motion.article ref={ref} className={`nb-card ${view} ${selected ? "selected" : ""}`} variants={{ hidden: safe.initial, visible: safe.animate }} exit={safe.exit}
      transition={safe.reduce ? safe.transition : springs.gentle}>
      {selecting && (
        <input type="checkbox" className="nb-check" aria-label={`Select ${nb.title}`} checked={selected} onChange={onToggleSelect} />
      )}
      <motion.button className="nb-cover" onClick={open} aria-label={`Open ${nb.title}`}
        whileHover={safe.reduce || view === "list" ? undefined : { y: -motionTokens.distance.xs }}
        whileTap={safe.reduce ? undefined : { scale: motionTokens.scale.subtle }} transition={springs.snappy}>
        <span className="nb-spine" style={{ background: nb.coverColor }} />
        {view === "grid" && <span className="nb-pages mono">{pages}</span>}
        {liveCount > 0 && <span className="live-tag mono">LIVE {liveCount}</span>}
        {kindTag && <span className="kind-tag mono" data-kind={nb.kind}>{kindTag}</span>}
      </motion.button>
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
          <span className="nb-title" data-testid="nb-title">
            {nb.favorite && <Star {...I} className="fav" aria-label="Favourite" fill="currentColor" />}
            {nb.title}
          </span>
        )}
        {view === "list" && <span className="nb-sub mono dim">{inTrash ? `${daysLeft} days left in Trash` : pages}</span>}
        {view === "grid" && inTrash && <span className="nb-sub mono dim">{daysLeft}d</span>}
        {!selecting && (
          <div style={{ position: "relative" }}>
            <button className="btn ghost icon" aria-label={`More for ${nb.title}`} onClick={() => setMenu(true)}>
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>
            {menu && <Menu onClose={() => setMenu(false)} style={{ right: 0, top: 34 }} items={items} />}
          </div>
        )}
      </footer>
    </motion.article>
  );
});
