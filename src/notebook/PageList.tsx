"use client";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";
import { MoreHorizontal } from "lucide-react";
import type { Notebook, Page, Template } from "../store/schema";
import { Menu, type MenuItem } from "../ui/Menu";
import { hasClipboard } from "../ink/clipboard";

const TEMPLATES: Template[] = ["blank", "ruled", "grid", "dot"];

export function PageList({ pages, notebook, mounted, width, renderPage, onDuplicate, onDelete, onBookmark, onTemplate, onPaste, onExportPage, onExportPageJpg, onRotate }: {
  pages: Page[]; notebook: Notebook; mounted: Set<number>; width: number;
  renderPage: (p: Page, index: number, mounted: boolean, width: number) => ReactNode;
  onDuplicate: (p: Page) => void; onDelete: (p: Page) => void; onBookmark: (p: Page) => void; onTemplate: (p: Page, t: Template) => void; onPaste?: (p: Page) => void; onExportPage?: (p: Page) => void; onExportPageJpg?: (p: Page) => void; onRotate?: (p: Page) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const safe = useSafeMotion(motionTokens.distance.lg);
  const [mountedAt] = useState(() => Date.now());
  return (
    <>
      {pages.map((p, i) => {
        const items: MenuItem[] = [
          ...(p.kind === "ink" && onPaste && hasClipboard() ? [{ label: "Paste here", onSelect: () => onPaste(p) }] : []),
          { label: "Duplicate", onSelect: () => onDuplicate(p) },
          { label: notebook.bookmarks.includes(p.id) ? "Remove bookmark" : "Bookmark", onSelect: () => onBookmark(p) },
          ...(p.kind === "ink" ? TEMPLATES.filter((t) => t !== p.template).map((t) => ({ label: `Template: ${t}`, onSelect: () => onTemplate(p, t) })) : []),
          ...(p.kind === "ink" && onRotate ? [{ label: "Rotate page", onSelect: () => onRotate(p) }] : []),
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
