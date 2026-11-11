"use client";
import { useEffect, useRef, useState } from "react";
import { Cpu, Cloud } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import type { Notebook, Page } from "../store/schema";
import { addCard } from "../store/cards";
import { findOrCreatePairedStudySet } from "../study/occlusion";
import { navigate } from "../App";
import { AiSetupNeeded, makeFlashcards, summarizeNotes, type DraftCard } from "./gemini";
import { notebookText, pageText } from "./pageText";
import "./ai.css";

export type AiRequest = { task: "summary" | "cards"; scope: "page"; page: Page; pageNumber: number } | { task: "summary" | "cards"; scope: "notebook" };

const listeners = new Set<(r: AiRequest) => void>();
export function openAi(r: AiRequest): void { listeners.forEach((f) => f(r)); }
export function onAiRequest(f: (r: AiRequest) => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

type State =
  | { s: "working"; status: string }
  | { s: "setup"; message: string }
  | { s: "error"; message: string }
  | { s: "empty" }
  | { s: "summary"; text: string; engine: "device" | "cloud" }
  | { s: "cards"; cards: (DraftCard & { keep: boolean })[]; engine: "device" | "cloud" };

/** Runs a Gemini task on a page or the whole notebook and shows the result, ready to keep. */
export function AiSheet({ request, notebook, pages, onClose, onAddSummary, onOpenSettings }: {
  request: AiRequest | null;
  notebook: Notebook;
  pages: Page[];
  onClose: () => void;
  /** keep the summary as a Text page (after the page it summarises, or first for a whole notebook) */
  onAddSummary: (title: string, text: string, afterPageId?: string) => Promise<void>;
  onOpenSettings?: () => void;
}) {
  const [st, setSt] = useState<State>({ s: "working", status: "" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request) return;
    const ctl = new AbortController();
    abort.current = ctl;
    const status = (s: string) => { if (!ctl.signal.aborted) setSt({ s: "working", status: s }); };
    void (async () => {
      try {
        status("Gathering the notes...");
        const text = request.scope === "page" ? await pageText(request.page, status) : await notebookText(pages, status);
        if (ctl.signal.aborted) return;
        if (text.replace(/\W/g, "").length < 20) { setSt({ s: "empty" }); return; }
        const what = request.scope === "page" ? `page ${request.pageNumber} of the notebook "${notebook.title}"` : `the notebook "${notebook.title}"`;
        if (request.task === "summary") {
          const r = await summarizeNotes(text, what, { signal: ctl.signal, onStatus: status });
          if (!ctl.signal.aborted) setSt({ s: "summary", text: r.text, engine: r.engine });
        } else {
          const r = await makeFlashcards(text, { signal: ctl.signal, onStatus: status });
          if (ctl.signal.aborted) return;
          if (r.cards.length === 0) setSt({ s: "error", message: "Gemini didn't return any cards. Try again, or add more to the page." });
          else setSt({ s: "cards", cards: r.cards.map((c) => ({ ...c, keep: true })), engine: r.engine });
        }
      } catch (e) {
        if (ctl.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        setSt(e instanceof AiSetupNeeded ? { s: "setup", message } : { s: "error", message });
      }
    })();
    return () => ctl.abort();
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { abort.current?.abort(); onClose(); };
  const title = !request ? "" : `${request.task === "summary" ? "Summary" : "Flashcards"} of ${request.scope === "page" ? `page ${request.pageNumber}` : "this notebook"}`;
  const engineTag = (engine: "device" | "cloud") => (
    <span className="ai-engine small dim">
      {engine === "device" ? <><Cpu size={13} strokeWidth={1.5} />Gemini Nano on this device</> : <><Cloud size={13} strokeWidth={1.5} />Gemini (cloud)</>}
    </span>
  );

  const keepCards = async (cards: DraftCard[]) => {
    const set = await findOrCreatePairedStudySet(notebook);
    for (const c of cards) await addCard(set.id, c);
    toast(`Added ${cards.length} ${cards.length === 1 ? "card" : "cards"} to "${set.title}"`, { label: "Study now", run: () => navigate(`/nb/${set.id}`) });
    close();
  };

  return (
    <Sheet open={!!request} onClose={close} title={title} width={620}>
      <div className="ai-sheet" aria-live="polite">
        {st.s === "working" && <p className="dim"><span className="recog-spinner" aria-hidden /> {st.status || "Working..."}</p>}
        {st.s === "empty" && <p className="dim">There isn&apos;t enough text here yet. Write or type some notes first (handwriting is read on this device).</p>}
        {st.s === "setup" && (
          <>
            <p>{st.message}</p>
            <p className="dim small">
              Cloud: paste your own free key from Google AI Studio in Settings. Your notes&apos; text is then sent to Google to answer.
              On this device: desktop Chrome with Gemini Nano works offline and sends nothing.
            </p>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={close}>Close</button>
              {onOpenSettings && <button type="button" className="btn primary" onClick={() => { close(); onOpenSettings(); }}>Open Settings</button>}
            </div>
          </>
        )}
        {st.s === "error" && (
          <>
            <p>{st.message}</p>
            <div className="row-end"><button type="button" className="btn" onClick={close}>Close</button></div>
          </>
        )}
        {st.s === "summary" && request && (
          <>
            {engineTag(st.engine)}
            <div className="ai-summary">{st.text}</div>
            <p className="dim small">Check it against your notes: AI summaries can miss or misread things.</p>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={() => { void navigator.clipboard?.writeText(st.text).then(() => toast("Copied")); }}>Copy</button>
              <button type="button" className="btn primary" onClick={() => {
                void onAddSummary(title, st.text, request.scope === "page" ? request.page.id : undefined).then(close);
              }}>Add as a page</button>
            </div>
          </>
        )}
        {st.s === "cards" && (
          <>
            {engineTag(st.engine)}
            <ul className="ai-cards">
              {st.cards.map((c, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={c.keep} aria-label={`Keep card ${i + 1}`}
                      onChange={(e) => setSt({ ...st, cards: st.cards.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) })} />
                    <span><strong>{c.front}</strong><span className="dim">{c.back}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              <button type="button" className="btn primary" disabled={!st.cards.some((c) => c.keep)}
                onClick={() => void keepCards(st.cards.filter((c) => c.keep))}>
                Add {st.cards.filter((c) => c.keep).length} to study cards
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
