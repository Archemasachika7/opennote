import { useEffect, useState } from "react";
import { ArrowDownToLine, FilePlus2, FileText, Hash } from "lucide-react";
import type { Page } from "../store/schema";
import { insertPage } from "../store/pages";
import { Sheet } from "../ui/Sheet";

/**
 * "Where should this go?" Used whenever the destination isn't obvious: pasting, moving a selection to
 * another page, inserting a picture or recognised text. Answers with the id of an ink page (creating a
 * new one if asked), or null when cancelled.
 */
type Ask = { title: string; fromPageId?: string; allowCurrent?: boolean; resolve: (pageId: string | null) => void };
const subs = new Set<(a: Ask) => void>();

export function askPlace(opts: { title: string; fromPageId?: string; allowCurrent?: boolean }): Promise<string | null> {
  if (subs.size === 0) return Promise.resolve(null);
  return new Promise((resolve) => subs.forEach((f) => f({ allowCurrent: true, ...opts, resolve })));
}

const I = { size: 18, strokeWidth: 1.5 } as const;

/** Mounted once by the notebook view, which knows the pages. */
export function PlaceHost({ notebookId, pages, current }: { notebookId: string; pages: Page[]; current: number }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [num, setNum] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { const f = (a: Ask) => { setAsk(a); setNum(""); setErr(""); }; subs.add(f); return () => { subs.delete(f); }; }, []);

  const from = ask?.fromPageId ? Math.max(0, pages.findIndex((p) => p.id === ask.fromPageId)) : current;
  const here = pages[from];
  const next = pages[from + 1];
  const done = (pageId: string | null) => { ask?.resolve(pageId); setAsk(null); };
  const newAfter = async (i: number) => done((await insertPage(notebookId, i + 1, { kind: "ink", template: "blank" })).id);
  const goNumber = () => {
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1 || n > pages.length) { setErr(`Enter a page from 1 to ${pages.length}.`); return; }
    const p = pages[n - 1];
    if (p.kind !== "ink") { setErr(`Page ${n} is a ${p.kind === "text" ? "text" : "live"} page. Pick a writing page, or a new page.`); return; }
    done(p.id);
  };

  type Opt = { key: string; title: string; hint: string; icon: JSX.Element; run: () => void };
  const opts: Opt[] = [];
  if (ask?.allowCurrent && here?.kind === "ink") opts.push({ key: "here", title: `This page (page ${from + 1})`, hint: "Right where you are", icon: <FileText {...I} />, run: () => done(here.id) });
  if (next?.kind === "ink") opts.push({ key: "next", title: `Next page (page ${from + 2})`, hint: "Same spot on the following page", icon: <ArrowDownToLine {...I} />, run: () => done(next.id) });
  opts.push({ key: "new", title: `New page after page ${from + 1}`, hint: "Adds a blank writing page", icon: <FilePlus2 {...I} />, run: () => void newAfter(from) });

  return (
    <Sheet open={!!ask} onClose={() => done(null)} title={ask?.title ?? "Where should this go?"} width={460}>
      <div className="place-options">
        {opts.map((o) => (
          <button key={o.key} type="button" className="insert-card" onClick={o.run}>
            <span className="insert-icon" aria-hidden>{o.icon}</span>
            <span className="insert-text"><span className="insert-title">{o.title}</span><span className="insert-hint">{o.hint}</span></span>
          </button>
        ))}
        <form className="place-number" onSubmit={(e) => { e.preventDefault(); goNumber(); }}>
          <span className="insert-icon" aria-hidden><Hash {...I} /></span>
          <label className="insert-text" htmlFor="place-num">
            <span className="insert-title">Page number</span>
            <span className="insert-hint">Any writing page in this notebook</span>
          </label>
          <input id="place-num" className="input" type="number" min={1} max={pages.length} inputMode="numeric" placeholder={`1–${pages.length}`}
            value={num} onChange={(e) => { setNum(e.target.value); setErr(""); }} style={{ width: 84 }} />
          <button type="submit" className="btn primary" disabled={!num}>Go</button>
        </form>
        {err && <p className="small" role="alert" style={{ margin: 0, color: "var(--danger)" }}>{err}</p>}
      </div>
    </Sheet>
  );
}
