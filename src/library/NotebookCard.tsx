"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Notebook } from "../store/schema";
import { Menu } from "../ui/Menu";

export function NotebookCard({ nb, liveCount, onOpen, onRename, onDelete }: {
  nb: Notebook; liveCount: number; onOpen: () => void; onRename: (title: string) => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nb.title);
  const safe = useSafeMotion(motionTokens.distance.md);
  return (
    <motion.article className="nb-card" variants={{ hidden: safe.initial, visible: safe.animate }} exit={safe.exit}
      transition={safe.reduce ? safe.transition : springs.gentle}>
      <motion.button className="nb-cover" onClick={onOpen} aria-label={`Open ${nb.title}`}
        whileHover={safe.reduce ? undefined : { y: -motionTokens.distance.xs }}
        whileTap={safe.reduce ? undefined : { scale: motionTokens.scale.subtle }} transition={springs.snappy}>
        <span className="nb-spine" style={{ background: nb.coverColor }} />
        <span className="nb-pages mono">{nb.pageIds.length} {nb.pageIds.length === 1 ? "page" : "pages"}</span>
        {liveCount > 0 && <span className="live-tag mono">LIVE {liveCount}</span>}
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
    </motion.article>
  );
}
