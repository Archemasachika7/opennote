"use client";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";
import { Bookmark, MoreHorizontal } from "lucide-react";
import type { Notebook, Page, Template } from "../store/schema";
import { Menu, type MenuItem } from "../ui/Menu";
import { hasClipboard } from "../ink/clipboard";

const TEMPLATES: Template[] = ["blank", "ruled", "grid", "dot"];

export function PageList({
  pages, notebook, mounted, width, renderPage,
  onDuplicate, onDelete, onBookmark, onTemplate, onMovePage, onPaste, onExportPage, onExportPageJpg, onRotate, onLayers, onTapeAll,
}: {
  pages: Page[]; notebook: Notebook; mounted: Set<number>; width: number;
  renderPage: (p: Page, index: number, mounted: boolean, width: number) => ReactNode;
  onDuplicate: (p: Page) => void;
  onDelete: (p: Page) => void;
  onBookmark: (p: Page) => void;
  onTemplate: (p: Page, t: Template) => void;
  onMovePage?: (from: number, to: number) => void;
  onPaste?: (p: Page) => void;
  onExportPage?: (p: Page) => void;
  onExportPageJpg?: (p: Page) => void;
  onRotate?: (p: Page) => void;
  onLayers?: (p: Page) => void;
  onTapeAll?: (p: Page, revealed: boolean) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const safe = useSafeMotion(motionTokens.distance.lg);
  const [mountedAt] = useState(() => Date.now());
  return (
    <>
      {pages.map((p, i) => {
        const isBookmarked = notebook.bookmarks.includes(p.id);
        const items: MenuItem[] = [
          ...(p.kind === "ink" && onPaste && hasClipboard() ? [{ label: "Paste here", onSelect: () => onPaste(p) }] : []),
          { label: "Duplicate", onSelect: () => onDuplicate(p) },
          { label: isBookmarked ? "Remove bookmark" : "Bookmark", onSelect: () => onBookmark(p) },
          ...(onMovePage && i > 0 ? [{ label: "Move page up", onSelect: () => onMovePage(i, i - 1) }] : []),
          ...(onMovePage && i < pages.length - 1 ? [{ label: "Move page down", onSelect: () => onMovePage(i, i + 1) }] : []),
          ...(p.kind === "ink" ? TEMPLATES.filter((t) => t !== p.template).map((t) => ({ label: `Template: ${t}`, onSelect: () => onTemplate(p, t) })) : []),
          ...(p.kind === "ink" && onRotate ? [{ label: "Rotate page", onSelect: () => onRotate(p) }] : []),
          ...(p.kind === "ink" && onLayers ? [{ label: "Layers...", onSelect: () => onLayers(p) }] : []),
          ...(p.kind === "ink" && onTapeAll ? [
            { label: "Reveal all tape", onSelect: () => onTapeAll(p, true) },
            { label: "Cover all tape", onSelect: () => onTapeAll(p, false) },
          ] : []),
          ...(onExportPage ? [{ label: "Export page as PDF", onSelect: () => onExportPage(p) }] : []),
          ...(onExportPageJpg ? [{ label: "Export page as JPG", onSelect: () => onExportPageJpg(p) }] : []),
          { label: "Delete", danger: true, onSelect: () => onDelete(p) },
        ];
        return (
          <motion.section key={p.id} className={`page-wrap ${p.kind === "html" ? "live" : ""}`} data-page-index={i} id={`page-${p.id}`}
            // only pages created while the notebook is open animate in; existing pages appear at once
            initial={p.createdAt > mountedAt ? safe.initial : false} animate={safe.animate}
            transition={safe.reduce ? safe.transition : springs.gentle}>
            <header className="page-head">
              <span className="mono dim">{i + 1}</span>
              {isBookmarked && <Bookmark size={13} strokeWidth={1.5} color="var(--accent)" fill="currentColor" aria-hidden />}
              {p.kind === "html" && <span className="live-tag mono inline">LIVE</span>}
              <span className="page-head-title">{p.kind === "html" ? p.title : ""}</span>
              <div style={{ position: "relative" }}>
                <button className="btn ghost icon" aria-label={`Page options ${i + 1}`} onClick={() => setMenuFor(p.id)}>
                  <MoreHorizontal size={16} strokeWidth={1.5} />
                </button>
                {menuFor === p.id && <Menu items={items} onClose={() => setMenuFor(null)} style={{ right: 0, top: 34 }} />}
              </div>
            </header>
            {renderPage(p, i, mounted.has(i), width)}
          </motion.section>
        );
      })}
    </>
  );
}
