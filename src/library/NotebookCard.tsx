"use client";
import { forwardRef, useRef, useState } from "react";
import { openFromCover } from "../ui/CoverLaunch";
import { CoverPreview } from "./CoverPreview";
import { motion } from "motion/react";
import { Folder, Lock, MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import type { Notebook } from "../store/schema";
import { COVERS } from "../store/notebooks";
import { Menu, type MenuItem } from "../ui/Menu";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";

const I = { size: 14, strokeWidth: 1.5 } as const;

export function formatRelativeTime(ts: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - ts);
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type NotebookCardProps = {
  nb: Notebook;
  liveCount: number;
  cardCount?: number;
  folderName?: string;
  view: "grid" | "list";
  inTrash: boolean;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRename: (title: string) => void;
  onCoverColor?: (color: string) => void;
  onTrash: () => void;
  onFavorite: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
  /** Lock with a password (absent for study sets and in Trash). */
  onLock?: () => void;
};

// forwardRef: the library list animates cards out with AnimatePresence "popLayout", which needs a ref
export const NotebookCard = forwardRef<HTMLElement, NotebookCardProps>(function NotebookCard({
  nb, liveCount, cardCount = 0, folderName, view, inTrash, selecting, selected,
  onToggleSelect, onOpen, onRename, onCoverColor, onTrash, onFavorite, onRestore, onDeleteForever, onLock,
}, ref) {
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
      ...(onLock && !nb.locked ? [{ label: "Lock with password…", icon: <Lock {...I} />, onSelect: onLock }] : []),
      { label: "Move to Trash", icon: <Trash2 {...I} />, danger: true, onSelect: onTrash },
      { label: "Delete…", icon: <Trash2 {...I} />, danger: true, onSelect: onDeleteForever },
    ];

  const coverPicker = !inTrash && onCoverColor ? (
    <div className="cover-picker" role="group" aria-label="Cover colour">
      <span className="cover-picker-label dim">Cover</span>
      <div className="cover-swatches">
        {COVERS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${nb.coverColor === c ? "on" : ""}`}
            style={{ background: c }}
            aria-label={`Cover ${c}`}
            onClick={() => { onCoverColor(c); setMenu(false); }}
          />
        ))}
      </div>
    </div>
  ) : undefined;

  const coverRef = useRef<HTMLButtonElement | null>(null);
  // the cover grows into the notebook (CoverLaunch), unless the user prefers reduced motion
  const open = () => (selecting ? onToggleSelect() : inTrash ? undefined : openFromCover(coverRef.current, onOpen));
  const daysLeft = nb.trashedAt ? Math.max(0, 30 - Math.floor((Date.now() - nb.trashedAt) / 864e5)) : 0;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const pages = nb.kind === "studyset" ? count(cardCount, "card", "cards")
    : nb.kind === "whiteboard" ? count(nb.pageIds.length, "board", "boards")
    : count(nb.pageIds.length, "page", "pages");
  const kindTag = nb.kind === "studyset" ? "STUDY" : nb.kind === "whiteboard" ? "BOARD" : null;
  const updatedText = formatRelativeTime(nb.updatedAt);

  return (
    <motion.article ref={ref} className={`nb-card ${view} ${selected ? "selected" : ""}`}
      // sorting or filtering moves cards to new places: let them glide there instead of jumping
      layout={safe.reduce ? false : "position"}
      variants={{ hidden: safe.initial, visible: safe.animate }} exit={safe.exit}
      transition={safe.reduce ? safe.transition : springs.gentle}>
      {selecting && (
        <input type="checkbox" className="nb-check" aria-label={`Select ${nb.title}`} checked={selected} onChange={onToggleSelect} />
      )}
      <motion.button ref={coverRef} className={`nb-cover kind-surface-${nb.kind ?? "notebook"}`} onClick={open} aria-label={`Open ${nb.title}`}
        whileHover={safe.reduce || view === "list" ? undefined : { y: -motionTokens.distance.xs }}
        whileTap={safe.reduce ? undefined : { scale: motionTokens.scale.subtle }} transition={springs.snappy}>
        <span className="nb-spine" style={{ ["--cover" as string]: nb.coverColor }} />
        <span className="nb-texture" aria-hidden />
        {view === "grid" && <CoverPreview nb={nb} />}
        {view === "grid" && (
          <span className="nb-cover-foot">
            <span className="nb-pages mono">{pages}</span>
            {!inTrash && <span className="nb-updated mono">{updatedText}</span>}
          </span>
        )}
        {liveCount > 0 && <span className="live-tag nb-live-count mono">LIVE {liveCount}</span>}
        {kindTag && <span className="kind-tag mono" data-kind={nb.kind}>{kindTag}</span>}
      </motion.button>
      <footer className="nb-meta">
        {editing ? (
          <input className="input" aria-label="Notebook name" autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft.trim()) onRename(draft.trim()); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { e.preventDefault(); setDraft(nb.title); setEditing(false); }
            }} />
        ) : (
          <div className="nb-title-stack">
            <span className="nb-title" data-testid="nb-title">
              {nb.favorite && <Star {...I} className="fav" aria-label="Favourite" fill="currentColor" />}
              {nb.locked && <Lock {...I} className="nb-lock" aria-label="Locked with a password" />}
              {nb.title}
            </span>
            {folderName && !inTrash && (
              <span className="nb-folder-pill dim"><Folder size={11} strokeWidth={1.5} />{folderName}</span>
            )}
          </div>
        )}
        {view === "list" && <span className="nb-sub mono dim">{inTrash ? `${daysLeft} days left in Trash` : `${pages} · ${updatedText}`}</span>}
        {view === "grid" && inTrash && <span className="nb-sub mono dim">{daysLeft}d</span>}
        {!selecting && (
          <div style={{ position: "relative" }}>
            <button className="btn ghost icon" aria-label={`More for ${nb.title}`} onClick={() => setMenu(true)}>
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>
            {menu && <Menu onClose={() => setMenu(false)} style={{ right: 0, top: 34 }} items={items} footer={coverPicker} />}
          </div>
        )}
      </footer>
    </motion.article>
  );
});
