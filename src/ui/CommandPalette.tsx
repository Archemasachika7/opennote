"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, GraduationCap, LayoutDashboard, Moon, Plus, Search, Settings, Sparkles, Sun } from "lucide-react";
import { Sheet } from "./Sheet";
import { searchAll, type SearchHit } from "../store/search";
import { createNotebook } from "../store/notebooks";
import { useTheme } from "./theme";
import { highlightText } from "./highlight";

const I = { size: 15, strokeWidth: 1.5 } as const;

type ActionEntry = {
  id: string;
  label: string;
  sub?: string;
  badge?: string;
  live?: boolean;
  icon: JSX.Element;
  run: () => void;
};

export function CommandPalette({ open, onClose, onNavigate, onOpenSettings, inNotebook }: {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
  inNotebook: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, setTheme, resolvedTheme] = useTheme();

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); setActiveIdx(0); return; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      void searchAll(q).then((res) => { if (alive) { setHits(res.slice(0, 12)); setActiveIdx(0); } });
    }, 80);
    return () => { alive = false; clearTimeout(t); };
  }, [open, q]);

  const baseActions = useMemo<ActionEntry[]>(() => {
    const list: ActionEntry[] = [
      ...(inNotebook ? [{
        id: "go-lib",
        label: "Back to Library",
        sub: "Return to all notebooks",
        icon: <ArrowLeft {...I} />,
        run: () => onNavigate("/"),
      }] : []),
      {
        id: "new-nb",
        label: "New notebook",
        sub: "Create an ink, text & live artifact notebook",
        icon: <Plus {...I} />,
        run: async () => { const nb = await createNotebook({ title: "Untitled notebook" }); onNavigate(`/nb/${nb.id}`); },
      },
      {
        id: "new-wb",
        label: "New whiteboard",
        sub: "Create an infinite canvas board",
        icon: <LayoutDashboard {...I} />,
        run: async () => { const nb = await createNotebook({ title: "Untitled whiteboard", kind: "whiteboard" }); onNavigate(`/nb/${nb.id}`); },
      },
      {
        id: "new-ss",
        label: "New study set",
        sub: "Create flashcards with Smart Learn SRS",
        icon: <GraduationCap {...I} />,
        run: async () => { const nb = await createNotebook({ title: "Untitled study set", kind: "studyset" }); onNavigate(`/nb/${nb.id}`); },
      },
      {
        id: "toggle-theme",
        label: resolvedTheme === "dark" ? "Switch to Light theme" : "Switch to Dark theme",
        sub: "Toggle studio appearance",
        icon: resolvedTheme === "dark" ? <Sun {...I} /> : <Moon {...I} />,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "open-settings",
        label: "Settings, Storage & Keyboard Shortcuts",
        sub: "Check offline storage meter and shortcuts",
        badge: "?",
        icon: <Settings {...I} />,
        run: () => onOpenSettings(),
      },
      {
        id: "go-welcome",
        label: "Open Product Overview",
        sub: "Interactive studio landing page & playground",
        icon: <Sparkles {...I} />,
        run: () => onNavigate("/welcome"),
      },
    ];
    const term = q.trim().toLowerCase();
    return term ? list.filter((a) => a.label.toLowerCase().includes(term) || (a.sub?.toLowerCase().includes(term) ?? false)) : list;
  }, [inNotebook, onNavigate, onOpenSettings, q, resolvedTheme, setTheme]);

  const hitEntries: ActionEntry[] = hits.map((h, i) => ({
    id: `hit-${i}-${h.notebookId}-${h.pageId ?? ""}`,
    label: h.title,
    sub: h.snippet,
    badge: h.kind === "live" ? "LIVE" : h.kind === "pdf" ? "PDF" : h.kind === "text" ? "TEXT" : h.kind === "card" ? "STUDY" : "NOTEBOOK",
    live: h.kind === "live",
    icon: h.kind === "live" ? <Sparkles {...I} color="var(--live)" /> : h.kind === "card" ? <GraduationCap {...I} /> : <FileText {...I} />,
    run: () => onNavigate(`/nb/${h.notebookId}${h.pageId ? `?p=${h.pageId}` : ""}`),
  }));

  const combined = [...hitEntries, ...baseActions];
  const clampedIdx = Math.min(activeIdx, Math.max(0, combined.length - 1));

  return (
    <Sheet open={open} onClose={onClose} title="Command Palette" width={580}>
      <div className="cmd-wrap">
        <label className="cmd-input-wrap">
          <Search {...I} aria-hidden />
          <input
            type="search"
            autoFocus
            aria-label="Command or search"
            placeholder="Jump to notebook, live artifact, text, or run an action..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (combined.length ? (i + 1) % combined.length : 0)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (combined.length ? (i <= 0 ? combined.length - 1 : i - 1) : 0)); }
              else if (e.key === "Enter" && combined[clampedIdx]) {
                e.preventDefault();
                const chosen = combined[clampedIdx];
                onClose();
                chosen.run();
              }
            }}
          />
        </label>
        <div className="cmd-list" role="listbox" aria-label="Results">
          {combined.length === 0 && <p className="dim cmd-empty">No matching notes or commands.</p>}
          {combined.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={idx === clampedIdx}
              className={`cmd-item ${idx === clampedIdx ? "on" : ""}`}
              onPointerEnter={() => setActiveIdx(idx)}
              onClick={() => { onClose(); item.run(); }}>
              <span className="cmd-icon">{item.icon}</span>
              <span className="cmd-main">
                <span className="cmd-label">{highlightText(item.label, q)}</span>
                {item.sub && <span className="cmd-sub dim">{highlightText(item.sub, q)}</span>}
              </span>
              {item.badge && (
                <span className={`cmd-badge mono ${item.live ? "live" : ""}`}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
