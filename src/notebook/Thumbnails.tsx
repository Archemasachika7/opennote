import { useState } from "react";
import { Plus } from "lucide-react";
import type { Page } from "../store/schema";
import { InsertMenu, type InsertKind } from "./InsertMenu";

export function Thumbnails({ pages, bookmarks, current, onJump, onInsert, onReorder }: {
  pages: Page[]; bookmarks: string[]; current: number;
  onJump: (index: number) => void; onInsert: (index: number, kind: InsertKind) => void; onReorder: (from: number, to: number) => void;
}) {
  const [tab, setTab] = useState<"pages" | "bookmarks">("pages");
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const gap = (index: number) => (
    <div className="thumb-gap" key={`gap-${index}`}>
      <button className="gap-btn" aria-label={`Insert page at ${index + 1}`} onClick={() => setMenuAt(index)}>
        <Plus size={12} strokeWidth={1.5} />
      </button>
      {menuAt === index && (
        <InsertMenu style={{ left: 24, top: 0 }} onClose={() => setMenuAt(null)} onPick={(k) => onInsert(index, k)} />
      )}
    </div>
  );

  return (
    <aside className="thumbs">
      <div className="thumb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "pages"} onClick={() => setTab("pages")}>Pages</button>
        <button role="tab" aria-selected={tab === "bookmarks"} onClick={() => setTab("bookmarks")}>Bookmarks</button>
      </div>
      {tab === "pages" ? (
        <div className="thumb-list">
          {gap(0)}
          {pages.map((p, i) => (
            <div key={p.id}>
              <button data-testid="thumb" data-live={p.kind === "html" ? "true" : undefined}
                className={`thumb ${i === current ? "current" : ""} ${p.kind === "html" ? "live" : ""}`}
                draggable onClick={() => onJump(i)}
                onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i); setDragFrom(null); }}
                aria-label={`Page ${i + 1}`}>
                <span className={`thumb-paper kind-${p.kind}`} />
                {p.kind === "html" && <span className="live-tag mono">LIVE</span>}
                <span className="thumb-num mono">{i + 1}</span>
              </button>
              {gap(i + 1)}
            </div>
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
                <span>{p.kind === "html" ? p.title : p.kind === "text" ? "Text page" : "Ink page"}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
