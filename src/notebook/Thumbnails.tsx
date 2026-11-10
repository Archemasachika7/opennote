import { useState } from "react";
import { Bookmark, Plus } from "lucide-react";
import type { Page, Paper } from "../store/schema";
import { InsertMenu, type InsertKind } from "./InsertMenu";
import { headingsOf } from "../text/outline";
import { textOf } from "../text/textOf";

const TABS = ["pages", "bookmarks", "outline"] as const;
type SideTab = (typeof TABS)[number];

export function Thumbnails({ pages, bookmarks, current, paper = "dark", onJump, onInsert, onReorder }: {
  pages: Page[]; bookmarks: string[]; current: number; paper?: Paper;
  onJump: (index: number) => void; onInsert: (index: number, kind: InsertKind) => void; onReorder: (from: number, to: number) => void;
}) {
  const [tab, setTab] = useState<SideTab>("pages");
  const outline = pages.flatMap((p, i) => (p.kind === "text" ? headingsOf(p.doc).map((h) => ({ ...h, page: i, key: `${p.id}-${h.index}` })) : []));
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const gap = (index: number) => (
    <div className="thumb-gap" key={`gap-${index}`}>
      <button className="gap-btn" aria-label={`Insert page at ${index + 1}`} onClick={() => setMenuAt(index)}>
        <Plus size={12} strokeWidth={1.5} />
      </button>
      {menuAt === index && (
        <InsertMenu style={{ left: 8, top: 20 }} onClose={() => setMenuAt(null)} onPick={(k) => onInsert(index, k)} />
      )}
    </div>
  );

  return (
    <aside className="thumbs" aria-label="Notebook navigation">
      <div className="thumb-tabs" role="tablist" onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const idx = TABS.indexOf(tab);
        const next = e.key === "ArrowRight" ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
        setTab(TABS[next]);
      }}>
        <button role="tab" aria-selected={tab === "pages"} onClick={() => setTab("pages")}>Pages</button>
        <button role="tab" aria-selected={tab === "bookmarks"} onClick={() => setTab("bookmarks")}>Bookmarks</button>
        <button role="tab" aria-selected={tab === "outline"} onClick={() => setTab("outline")}>Outline</button>
      </div>
      {tab === "pages" && pages.length > 0 && (
        <div className="goto">
          <input type="number" min={1} max={pages.length} className="input" aria-label="Go to page"
            placeholder={`Go to page (1-${pages.length})`}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const n = Number(e.currentTarget.value);
              if (Number.isInteger(n) && n >= 1 && n <= pages.length) onJump(n - 1);
            }} />
        </div>
      )}
      {tab === "pages" ? (
        <div className="thumb-list">
          {gap(0)}
          {pages.map((p, i) => {
            const bookmarked = bookmarks.includes(p.id);
            const previewText = p.kind === "html"
              ? p.title
              : p.kind === "text"
              ? (headingsOf(p.doc)[0]?.text || textOf(p.doc).slice(0, 60))
              : p.background?.pdfText
              ? "PDF"
              : "";
            const tplClass = p.kind === "ink" ? `thumb-tpl-${p.template}` : "";
            return (
              <div key={p.id}>
                <button data-testid="thumb" data-live={p.kind === "html" ? "true" : undefined}
                  className={`thumb thumb-${paper} ${tplClass} ${i === current ? "current" : ""} ${p.kind === "html" ? "live" : ""} ${dragOver === i && dragFrom !== i ? "drop-over" : ""}`}
                  style={p.kind === "ink" && p.size ? { aspectRatio: `${p.size.w} / ${p.size.h}` } : undefined}
                  draggable onClick={() => onJump(i)}
                  onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
                  onDragLeave={() => { if (dragOver === i) setDragOver(null); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  aria-label={`Page ${i + 1}`}>
                  <span className={`thumb-paper kind-${p.kind}`} />
                  {bookmarked && (
                    <span className="thumb-bm" aria-hidden>
                      <Bookmark size={11} strokeWidth={1.5} fill="currentColor" />
                    </span>
                  )}
                  {p.kind === "html" && <span className="live-tag mono">LIVE</span>}
                  {previewText && <span className="thumb-preview" aria-hidden>{previewText}</span>}
                  <span className="thumb-num mono">{i + 1}</span>
                </button>
                {gap(i + 1)}
              </div>
            );
          })}
        </div>
      ) : tab === "outline" ? (
        <div className="thumb-list">
          {outline.length === 0 && <p className="dim" style={{ padding: 12 }}>Headings in text pages appear here.</p>}
          {outline.map((h) => (
            <button key={h.key} data-testid="outline-item" data-level={h.level} className="outline-row"
              style={{ paddingLeft: 8 + (h.level - 1) * 12 }} onClick={() => onJump(h.page)}>{h.text}</button>
          ))}
        </div>
      ) : (
        <div className="thumb-list">
          {bookmarks.length === 0 && <p className="dim" style={{ padding: 12 }}>No bookmarks yet.</p>}
          {bookmarks.map((id) => {
            const i = pages.findIndex((p) => p.id === id);
            if (i < 0) return null;
            const p = pages[i];
            return (
              <button key={id} data-testid="bookmark" className="bookmark-row" onClick={() => onJump(i)}>
                <span className="mono dim">{i + 1}</span>
                <span>{p.kind === "html" ? p.title : p.kind === "text" ? (headingsOf(p.doc)[0]?.text || "Text page") : "Ink page"}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
