"use client";
import { blotReact } from "../ui/blotBus";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, ImagePlus, Plus, RotateCcw, Settings, Shuffle, Trash2, X } from "lucide-react";
import { navigate } from "../App";
import type { Card, Notebook } from "../store/schema";
import { getNotebook, renameNotebook, restoreNotebook } from "../store/notebooks";
import {
  addCard, deleteCardWithUndo, listCards, moveCard, resetProgress, restoreDeletedCard, reviewCard, setCardImage, updateCard,
} from "../store/cards";
import { useLive } from "../store/useLive";
import { useBlobUrl } from "../ui/useBlobUrl";
import { toast } from "../ui/Toast";
import { platform } from "../platform/port";
import { motionTokens, springs, useSafeMotion } from "../ui/motion";
import { DAY, isDue, nextLabel, progressOf, type Grade } from "./srs";
import { nextLabelFsrs, retrievability, type SrsWithFsrs } from "./fsrs";
import "./study.css";

const I = { size: 15, strokeWidth: 1.5 } as const;
type Tab = "cards" | "practice" | "learn";

/** A study set: write flashcards, flip through them, or learn them with spaced repetition. */
export function StudySetView({ id, onOpenSettings }: { id: string; onOpenSettings?: () => void }) {
  const nb = useLive(async () => (await getNotebook(id)) ?? null, [id], undefined as Notebook | null | undefined);
  const cards = useLive(() => listCards(id), [id], [] as Card[]);
  const [tab, setTab] = useState<Tab>("cards");

  if (nb === undefined) return <main className="nb-loading dim">Loading...</main>;
  if (nb === null) {
    return (
      <main className="nb-missing">
        <h2>Study set not found</h2>
        <p className="dim">This study set does not exist on this device or may have been deleted.</p>
        <div className="row-end" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => navigate("/")}>Back to library</button>
        </div>
      </main>
    );
  }
  if (nb.trashedAt) {
    return (
      <main className="nb-trashed">
        <h2>&ldquo;{nb.title}&rdquo; is in Trash.</h2>
        <p className="dim">Restore it to keep studying it. Items in Trash are deleted after 30 days.</p>
        <div className="row-end" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => navigate("/")}>Back to library</button>
          <button className="btn primary" onClick={() => restoreNotebook(nb.id)}>Restore</button>
        </div>
      </main>
    );
  }
  const tabs: [Tab, string][] = [["cards", "Cards"], ["practice", "Practice"], ["learn", "Smart Learn"]];
  return (
    <div className="study" data-testid="study-set">
      <header className="nb-toolbar">
        <button className="btn ghost icon" aria-label="Back to library" onClick={() => navigate("/")}><ArrowLeft {...I} /></button>
        <input className="study-title" aria-label="Study set name" defaultValue={nb.title} key={nb.title}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== nb.title) void renameNotebook(nb.id, v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className="mono dim">{cards.length} {cards.length === 1 ? "card" : "cards"}</span>
        <div className="study-tabs" role="tablist" aria-label="Mode" onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const idx = tabs.findIndex(([t]) => t === tab);
          const next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
          setTab(tabs[next][0]);
        }}>
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {tab === t && <motion.span layoutId="study-tab" className="mode-pill" transition={springs.snappy} />}{label}
            </button>
          ))}
        </div>
        {onOpenSettings && (
          <button className="btn ghost icon" aria-label="Settings" title="Settings & shortcuts (?)" onClick={onOpenSettings}>
            <Settings {...I} />
          </button>
        )}
      </header>
      <main className="study-body">
        {tab === "cards" && <CardEditor setId={id} cards={cards} />}
        {tab === "practice" && <Practice cards={cards} onEdit={() => setTab("cards")} />}
        {tab === "learn" && <Learn setId={id} cards={cards} onEdit={() => setTab("cards")} />}
      </main>
    </div>
  );
}

function CardImage({ blobId, onRemove }: { blobId?: string; onRemove?: () => void }) {
  const url = useBlobUrl(blobId);
  if (!url) return null;
  return (
    <span className="card-img">
      <img src={url} alt="" />
      {onRemove && <button className="btn ghost icon" aria-label="Remove picture" onClick={onRemove}><X size={13} strokeWidth={1.5} /></button>}
    </span>
  );
}

function CardEditor({ setId, cards }: { setId: string; cards: Card[] }) {
  const pick = async (c: Card, side: "front" | "back") => {
    const [f] = await platform.openFiles(["image/*"]);
    if (f) await setCardImage(c.id, side, f);
  };
  const add = async () => {
    const c = await addCard(setId);
    setTimeout(() => (document.getElementById(`q-${c.id}`) as HTMLTextAreaElement | null)?.focus(), 30);
  };
  const remove = async (c: Card) => {
    const snap = await deleteCardWithUndo(c.id);
    if (snap) {
      toast("Card deleted", { label: "Undo", run: () => { void restoreDeletedCard(snap); } });
    }
  };
  return (
    <section className="card-editor">
      {cards.length === 0 && (
        <div className="empty">
          <h2>No cards yet</h2>
          <p className="dim">Add a card with a question on the front and the answer on the back.</p>
        </div>
      )}
      <ol className="card-list">
        {cards.map((c, i) => (
          <li key={c.id} className="card-row">
            <span className="mono dim card-n">{i + 1}</span>
            <div className="card-side">
              <textarea id={`q-${c.id}`} className="input" aria-label={`Question ${i + 1}`} placeholder="Question" defaultValue={c.front}
                onChange={(e) => updateCard(c.id, { front: e.target.value })} />
              <CardImage blobId={c.frontImage} onRemove={() => setCardImage(c.id, "front", null)} />
            </div>
            <div className="card-side">
              <textarea className="input" aria-label={`Answer ${i + 1}`} placeholder="Answer" defaultValue={c.back}
                onChange={(e) => updateCard(c.id, { back: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && i === cards.length - 1) { e.preventDefault(); void add(); } }} />
              <CardImage blobId={c.backImage} onRemove={() => setCardImage(c.id, "back", null)} />
            </div>
            <div className="card-actions">
              <button className="btn ghost icon" aria-label={`Add picture to question ${i + 1}`} title="Picture on the question" onClick={() => pick(c, "front")}><ImagePlus {...I} /></button>
              <button className="btn ghost icon" aria-label={`Add picture to answer ${i + 1}`} title="Picture on the answer" onClick={() => pick(c, "back")}><ImagePlus {...I} /></button>
              <button className="btn ghost icon" aria-label={`Move card ${i + 1} up`} disabled={i === 0} onClick={() => moveCard(setId, i, i - 1)}><ArrowUp {...I} /></button>
              <button className="btn ghost icon" aria-label={`Move card ${i + 1} down`} disabled={i === cards.length - 1} onClick={() => moveCard(setId, i, i + 1)}><ArrowDown {...I} /></button>
              <button className="btn ghost icon" aria-label={`Delete card ${i + 1}`} onClick={() => remove(c)}><Trash2 {...I} /></button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-end">
        <span className="dim small" style={{ alignSelf: "center" }}>Ctrl+Enter in the last answer adds a card</span>
        <button className="btn primary" onClick={add}><Plus {...I} />Add card</button>
      </div>
    </section>
  );
}

/** One card face with a flip animation (a quick fade when reduced motion is on). */
function Face({ card, flipped }: { card: Card; flipped: boolean }) {
  const safe = useSafeMotion(motionTokens.distance.sm);
  const text = flipped ? card.back : card.front;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={`${card.id}:${flipped}`} className={`flashcard ${flipped ? "back" : ""}`}
        initial={safe.reduce ? { opacity: 0 } : { opacity: 0, rotateX: -70 }} animate={{ opacity: 1, rotateX: 0 }}
        exit={safe.reduce ? { opacity: 0 } : { opacity: 0, rotateX: 70 }}
        transition={safe.reduce ? safe.transition : { duration: motionTokens.duration.fast }}>
        <span className="mono dim flash-side">{flipped ? "ANSWER" : "QUESTION"}</span>
        <p className="flash-text">{text || <span className="dim">(empty)</span>}</p>
        <CardImage blobId={flipped ? card.backImage : card.frontImage} />
      </motion.div>
    </AnimatePresence>
  );
}

function Practice({ cards, onEdit }: { cards: Card[]; onEdit: () => void }) {
  const [order, setOrder] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const ids = cards.map((c) => c.id).join();
  useEffect(() => { setOrder(cards.map((c) => c.id)); setI(0); setFlipped(false); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = order.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
  const card = list[Math.min(i, list.length - 1)];
  const go = (d: number) => { setI((x) => Math.max(0, Math.min(list.length - 1, x + d))); setFlipped(false); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, button, [role=tab]")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  if (!card) return <NoCards onEdit={onEdit} />;
  return (
    <section className="practice">
      <button className="flash-wrap" aria-label="Flip card" onClick={() => setFlipped((f) => !f)}><Face card={card} flipped={flipped} /></button>
      <div className="practice-bar">
        <button className="btn ghost icon" aria-label="Previous card" disabled={i === 0} onClick={() => go(-1)}><ChevronLeft {...I} /></button>
        <span className="mono">{Math.min(i, list.length - 1) + 1} / {list.length}</span>
        <button className="btn ghost icon" aria-label="Next card" disabled={i >= list.length - 1} onClick={() => go(1)}><ChevronRight {...I} /></button>
        <button className="btn ghost" onClick={() => { setOrder((o) => shuffle(o)); setI(0); setFlipped(false); }}><Shuffle {...I} />Shuffle</button>
      </div>
      <p className="dim small">Space flips the card, arrow keys move between cards.</p>
    </section>
  );
}

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const GRADES: { g: Grade; label: string; key: string }[] = [
  { g: "again", label: "Again", key: "1" }, { g: "hard", label: "Hard", key: "2" },
  { g: "good", label: "Good", key: "3" }, { g: "easy", label: "Easy", key: "4" },
];

function Learn({ setId, cards, onEdit }: { setId: string; cards: Card[]; onEdit: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [algo, setAlgo] = useState<"sm2" | "fsrs">(() => {
    try { return localStorage.getItem("opennote:srs-algo") === "fsrs" ? "fsrs" : "sm2"; } catch { return "sm2"; }
  });
  const switchAlgo = (nextAlgo: "sm2" | "fsrs") => {
    setAlgo(nextAlgo);
    try { localStorage.setItem("opennote:srs-algo", nextAlgo); } catch { /* ignore */ }
  };
  const due = useMemo(() => cards.filter((c) => isDue(c.srs, now)).sort((a, b) => a.srs.due - b.srs.due), [cards, now]);
  const card = due[0];
  const prog = progressOf(cards.map((c) => c.srs));
  const next = cards.length ? Math.min(...cards.map((c) => c.srs.due)) : 0;

  // learning steps come back within minutes: re-check now and then
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // one grade per card: a held or double-pressed key must not review it twice
  const busy = useRef(false);
  const last = useRef<{ id: string; due: number } | null>(null);
  const grade = async (g: Grade) => {
    if (!card || busy.current) return;
    // until the stored card updates, this render still shows the card that was just graded
    if (last.current && last.current.id === card.id && last.current.due === card.srs.due) return;
    busy.current = true;
    last.current = { id: card.id, due: card.srs.due };
    try {
      await reviewCard(card.id, g, undefined, algo);
      if (g === "good" || g === "easy") blotReact("cheer");
      setShown(false);
      setNow(Date.now());
    } finally { busy.current = false; }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, button, [role=tab]")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setShown(true); return; }
      const hit = shown ? GRADES.find((x) => x.key === e.key) : undefined;
      if (hit) { e.preventDefault(); void grade(hit.g); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  if (cards.length === 0) return <NoCards onEdit={onEdit} />;
  const total = cards.length;
  return (
    <section className="practice">
      <div className="progress" role="img" aria-label={`${prog.new} new, ${prog.learning} learning, ${prog.mastered} mastered`}>
        <span className="p-mastered" style={{ flex: prog.mastered }} />
        <span className="p-learning" style={{ flex: prog.learning }} />
        <span className="p-new" style={{ flex: prog.new }} />
      </div>
      <div className="progress-key mono small">
        <span><i className="p-new" />New {prog.new}</span>
        <span><i className="p-learning" />Learning {prog.learning}</span>
        <span><i className="p-mastered" />Mastered {prog.mastered}</span>
        <span className="dim">Due now {due.length} of {total}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <label htmlFor="srs-algo-select" className="dim">Scheduler:</label>
          <select
            id="srs-algo-select"
            aria-label="Scheduler algorithm"
            className="select"
            style={{ height: 28, fontSize: 12, padding: "0 8px" }}
            value={algo}
            onChange={(e) => switchAlgo(e.target.value as "sm2" | "fsrs")}>
            <option value="sm2">SM-2 (Classic)</option>
            <option value="fsrs">FSRS-4.5 (Adaptive)</option>
          </select>
        </span>
      </div>
      {card ? (
        <>
          {algo === "fsrs" && (card.srs as SrsWithFsrs).fsrs && (
            <div className="mono dim small" data-testid="fsrs-metrics">
              {(() => {
                const m = (card.srs as SrsWithFsrs).fsrs!;
                const r = Math.round(retrievability(m.stability, Math.max(0, (now - m.lastReview) / DAY)) * 100);
                return `Retention ${r}% · Stability ${m.stability.toFixed(1)}d · Difficulty ${m.difficulty.toFixed(1)}`;
              })()}
            </div>
          )}
          <div className="flash-wrap static"><Face card={card} flipped={shown} /></div>
          {!shown ? (
            <button className="btn primary big" onClick={() => setShown(true)}>Show answer</button>
          ) : (
            <div className="grades" role="group" aria-label="How well did you know it?">
              {GRADES.map((x) => (
                <button key={x.g} className={`btn grade-${x.g}`} onClick={() => grade(x.g)}>
                  {x.label}
                  <span className="mono dim small">
                    {algo === "fsrs" ? nextLabelFsrs(card.srs as SrsWithFsrs, x.g, now) : nextLabel(card.srs, x.g, now)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="dim small">Space shows the answer. Keys 1-4 rate it.</p>
        </>
      ) : (
        <div className="empty">
          <h2>All caught up</h2>
          <p className="dim">Next card is due {formatWhen(next, now)}.</p>
          <div className="row-end" style={{ justifyContent: "center" }}>
            {confirmReset ? (
              <>
                <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                <button className="btn danger" onClick={async () => {
                  await resetProgress(setId);
                  setConfirmReset(false);
                  setNow(Date.now());
                  toast("Learning progress reset");
                }}>Confirm reset</button>
              </>
            ) : (
              <button className="btn" onClick={() => setConfirmReset(true)}><RotateCcw {...I} />Start over</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatWhen(t: number, now: number): string {
  const ms = t - now;
  if (ms < 60 * 60_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 24 * 3_600_000) return `in ${Math.round(ms / 3_600_000)} h`;
  return `on ${new Date(t).toLocaleDateString()}`;
}

function NoCards({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="empty">
      <h2>No cards to study</h2>
      <p className="dim">Write a few cards first.</p>
      <div className="row-end" style={{ justifyContent: "center" }}><button className="btn primary" onClick={onEdit}>Write cards</button></div>
    </div>
  );
}
