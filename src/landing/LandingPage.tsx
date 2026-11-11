"use client";
import { useState, type ReactNode } from "react";
import { MotionConfig, motion, type Variants } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Command,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import { navigate } from "../App";
import { db, type DocKind } from "../store/schema";
import { createNotebook, listNotebooks } from "../store/notebooks";
import { useLive } from "../store/useLive";
import { createStarterNotebook } from "../library/demoNotebook";
import { useTheme } from "../ui/theme";
import { platform } from "../platform/port";
import { HeroCanvasDemo } from "./HeroCanvasDemo";
import { BentoDemos } from "./BentoDemos";
import { LiveArtifactDemo } from "./LiveArtifactDemo";
import { detectPlatform, GetOpenNote, SmartDownload } from "./GetOpenNote";
import { InkMark } from "./InkMark";
import { motionTokens } from "../ui/motion";
import "./landing.css";

const EASE = motionTokens.easing.smooth;

/** Fades a block up as it scrolls into view (once). MotionConfig reducedMotion="user" drops the movement. */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: motionTokens.distance.lg }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: motionTokens.duration.slow, delay: delay * motionTokens.stagger * 2, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Parent/child variants: rows of a list come in one after another as the list scrolls into view. */
const listIn: Variants = { hidden: {}, shown: { transition: { staggerChildren: motionTokens.stagger } } };
const itemIn: Variants = {
  hidden: { opacity: 0, y: motionTokens.distance.sm },
  shown: { opacity: 1, y: 0, transition: { duration: motionTokens.duration.normal, ease: EASE } },
};

const HEADLINE = ["Notes", "that", "run."];
const GITHUB = "https://github.com/Archemasachika7/opennote";

const COMPARE: [string, string, string][] = [
  ["Price", "Free, no ads", "Subscription or paid app"],
  ["Account", "Optional", "Usually required to sync"],
  ["Paste AI-made HTML, SVG, React", "Runs on the page", "Not supported"],
  ["Lecture audio linked to your ink", "Yes, tap a stroke to hear it", "In some apps"],
  ["Transcription", "On your device (Whisper)", "Cloud, often paid"],
  ["Sync", "End-to-end encrypted", "Readable by the provider"],
  ["Works offline", "Yes, fully", "Partly"],
];

const START: { kind: DocKind; title: string; text: string; icon: ReactNode }[] = [
  { kind: "notebook", title: "New notebook", text: "Pages of handwriting, typed text with maths, PDFs and live pages.", icon: <BookOpen size={16} strokeWidth={1.6} /> },
  { kind: "whiteboard", title: "New whiteboard", text: "A canvas with no edges. Pan, zoom and reuse your diagrams.", icon: <LayoutDashboard size={16} strokeWidth={1.6} /> },
  { kind: "studyset", title: "New study set", text: "Flashcards from your Study Tape, on a spaced-repetition schedule.", icon: <GraduationCap size={16} strokeWidth={1.6} /> },
];

function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Section heading: a handwritten margin note, the title, then one plain sentence. */
function SectionHead({ note, title, children, center }: { note: string; title: string; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`lp-section-head${center ? " lp-head-center" : ""}`}>
      <span className="lp-sec-kicker">{note}</span>
      <h2>{title}</h2>
      {children && <p className="lp-sec-lede">{children}</p>}
    </div>
  );
}

export function LandingPage({
  onOpenPalette,
  onOpenSettings,
}: {
  onOpenPalette?: () => void;
  onOpenSettings?: () => void;
}) {
  const [, setTheme, resolvedTheme] = useTheme();
  const [launching, setLaunching] = useState<string | null>(null);

  const notebookCount = useLive(
    async () => db.notebooks.filter((n) => !n.trashedAt).count(),
    [],
    0,
  );

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCreateDoc = async (kind: DocKind = "notebook") => {
    if (launching) return;
    setLaunching(kind);
    try {
      const isFirst = (await db.notebooks.count()) === 0;
      const title =
        kind === "whiteboard"
          ? "Untitled whiteboard"
          : kind === "studyset"
          ? "Untitled study set"
          : "Untitled notebook";
      const nb = await createNotebook({ title, kind });
      if (isFirst) void platform.requestPersistentStorage();
      navigate(`/nb/${nb.id}`);
    } finally {
      setLaunching(null);
    }
  };

  const handleLaunchDemo = async () => {
    if (launching) return;
    setLaunching("demo");
    try {
      const existing = (await listNotebooks()).find((n) => n.title === "Welcome to OpenNote" && !n.trashedAt);
      const nb = existing ?? (await createStarterNotebook());
      navigate(`/nb/${nb.id}`);
    } finally {
      setLaunching(null);
    }
  };

  const onDesktopOrWeb = detectPlatform() === "other";

  return (
    <MotionConfig reducedMotion="user">
    <div className="lp-root" data-testid="landing-page">
      <header className="lp-header">
        <div className="lp-header-inner">
          <div className="lp-brand">
            <svg className="lp-logo" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect x="3" y="2" width="26" height="28" rx="5" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
              <path d="M3 7C3 4.23858 5.23858 2 8 2H9.5V30H8C5.23858 30 3 27.7614 3 25V7Z" fill="var(--accent)" />
              <path d="M13 19.5C15.2 15 17.5 22.5 20.4 16.8C22 13.8 23.5 18 25.2 15.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24.5" cy="8.5" r="2" fill="var(--accent)" />
            </svg>
            <span className="lp-brand-name">OpenNote</span>
          </div>

          <nav className="lp-nav" aria-label="Landing sections">
            <button type="button" onClick={() => scrollToSection("lp-primitives")}>Features</button>
            <button type="button" onClick={() => scrollToSection("lp-live")}>Live pages</button>
            <button type="button" onClick={() => scrollToSection("lp-compare")}>Compare</button>
            <button type="button" onClick={() => scrollToSection("lp-download")}>Download</button>
          </nav>

          <div className="lp-header-actions">
            <a className="lp-icon-btn" href={GITHUB} target="_blank" rel="noreferrer"
              aria-label="OpenNote on GitHub" title="Source on GitHub">
              <GitHubMark size={14} />
            </a>
            {onOpenPalette && (
              <button
                type="button"
                className="lp-icon-btn mono"
                aria-label="Open command palette"
                title="Command palette (Ctrl+K)"
                onClick={onOpenPalette}>
                <Command size={13} strokeWidth={1.6} />
                <span>K</span>
              </button>
            )}
            <button
              type="button"
              className="lp-icon-btn"
              aria-label="Toggle studio theme"
              title={resolvedTheme === "dark" ? "Switch to light paper" : "Switch to dark"}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun size={14} strokeWidth={1.6} /> : <Moon size={14} strokeWidth={1.6} />}
            </button>
            <button
              type="button"
              className="btn primary lp-cta-sm"
              onClick={() => navigate("/")}>
              Open Studio
              <ArrowRight size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>

      <main className="lp-shell">
        {/* HERO: a ruled page with a margin line; the headline gets underlined by hand */}
        <section className="lp-hero lp-paper">
          <motion.div
            className="lp-hero-copy"
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, ease: EASE }}>
            <a className="lp-eyebrow" href={GITHUB} target="_blank" rel="noreferrer">
              <GitHubMark size={12} />
              <span>Free and open source</span>
              <ArrowRight size={12} strokeWidth={1.8} className="lp-eyebrow-arrow" />
            </a>

            <h1 className="lp-title" aria-label="Notes that run.">
              {HEADLINE.map((w, i) => (
                <motion.span key={w} className={`lp-title-word${i === 2 ? " lp-title-accent" : ""}`} aria-hidden
                  initial={{ opacity: 0, y: motionTokens.distance.sm }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: motionTokens.duration.slow * 0.8, delay: 0.08 + i * 0.09, ease: EASE }}>
                  {w}
                  {i === 2 && <InkMark variant="underline" className="lp-title-underline" delay={0.7} duration={0.55} />}
                </motion.span>
              ))}
            </h1>

            <p className="lp-subtitle">
              A pen-first notebook for lectures and problem sets. Write with your stylus, record a class and
              replay your ink in sync, and paste AI-made HTML, SVG or React onto a page, where it runs.
            </p>

            <div className="lp-hero-actions">
              {/* one click: the installer for this device (nothing on other devices) */}
              <SmartDownload />
              <button
                type="button"
                className={onDesktopOrWeb ? "btn primary lp-btn-lg" : "btn lp-btn-lg"}
                onClick={() => navigate("/")}>
                {onDesktopOrWeb ? "Start writing" : "Open in browser"}
                {notebookCount > 0 && (
                  <span className="lp-count-pill mono">{notebookCount}</span>
                )}
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="lp-text-link"
                disabled={launching !== null}
                onClick={() => void handleLaunchDemo()}>
                or open the 3-page demo
              </button>
            </div>

            <ul className="lp-proof" aria-label="At a glance">
              <li>No account</li>
              <li>Works offline</li>
              <li>Encrypted sync</li>
              <li>Web, Windows, Android</li>
            </ul>
          </motion.div>

          <motion.div
            id="lp-workbench"
            className="lp-hero-stage"
            initial={{ opacity: 0, y: motionTokens.distance.md }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.slow * 0.7, delay: 0.12, ease: EASE }}>
            <motion.p className="lp-margin-note" aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: motionTokens.duration.normal }}>
              <InkMark variant="arrow" className="lp-margin-arrow" delay={1.3} duration={0.5} />
              go on, write on it
            </motion.p>
            <HeroCanvasDemo />
          </motion.div>
        </section>

        {/* LAUNCH FILM */}
        <section id="lp-film" className="lp-section lp-film" aria-label="Launch film">
          <SectionHead center note="30-second tour" title="See a lecture go from ink to flashcards." />
          <Reveal>
            <video className="lp-film-video" controls preload="none" playsInline
              poster="/media/opennote-launch-poster.jpg" aria-label="OpenNote launch film, 30 seconds">
              <source src="/media/opennote-launch.mp4" type="video/mp4" />
              {/* Hosts with a small upload limit ship without the 22 MB film; the browser then tries this copy. */}
              <source src="https://opennote-neon-nine.vercel.app/media/opennote-launch.mp4" type="video/mp4" />
              <track kind="subtitles" src="/media/opennote-launch.srt" srcLang="en" label="English" />
            </video>
          </Reveal>
        </section>

        {/* TRY IT: every card is a working demo */}
        <section id="lp-primitives" className="lp-section">
          <SectionHead note="try it right here" title="Every card below works. Go ahead, draw on it.">
            Snap a shape, scrub a lecture replay, tune a wave, switch Indian languages, or peel back Study Tape.
          </SectionHead>
          <BentoDemos />
        </section>

        {/* SIGNATURE: PASTE -> RUN */}
        <section id="lp-live" className="lp-section">
          <SectionHead note="only in OpenNote" title="Copy an AI artifact. Paste. It runs.">
            HTML, SVG or React from Claude, ChatGPT or Gemini becomes a real page between your notes:
            interactive, offline, sandboxed, and you can write on it with your pen.
          </SectionHead>
          <Reveal><LiveArtifactDemo /></Reveal>
        </section>

        {/* COMPARISON */}
        <section id="lp-compare" className="lp-section">
          <SectionHead note="why OpenNote" title="What you get, next to a typical note app.">
            Typical means the usual paid handwriting apps. Check any app's own page before you buy.
          </SectionHead>
          <motion.div className="lp-compare" role="table" aria-label="OpenNote compared with a typical note app"
            variants={listIn} initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-60px" }}>
            <div role="row" className="lp-compare-row lp-compare-head">
              <span role="columnheader" />
              <span role="columnheader">OpenNote</span>
              <span role="columnheader">Typical note app</span>
            </div>
            {COMPARE.map(([what, ours, theirs]) => (
              <motion.div role="row" className="lp-compare-row" key={what} variants={itemIn}>
                <span role="rowheader">{what}</span>
                <span role="cell" className="lp-yes">{ours}</span>
                <span role="cell" className="dim">{theirs}</span>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <GetOpenNote />

        {/* START: the last page of the notebook */}
        <section id="lp-start" className="lp-section lp-start lp-paper">
          <div className="lp-section-head">
            <span className="lp-sec-kicker">free, no sign-up</span>
            <h2>
              Pick a page and start{" "}
              <span className="lp-underlined">writing.<InkMark variant="underline" className="lp-title-underline" delay={0.2} /></span>
            </h2>
            <p className="lp-sec-lede">It opens in this tab. Your notes stay on this device until you choose to sync.</p>
          </div>

          <motion.div className="lp-start-grid" variants={listIn} initial="hidden" whileInView="shown"
            viewport={{ once: true, margin: "-60px" }}>
            {START.map((s) => (
              <motion.button key={s.kind} type="button" className="lp-mode-card" variants={itemIn}
                disabled={launching !== null} onClick={() => void handleCreateDoc(s.kind)}>
                <div className="lp-mode-icon">{s.icon}</div>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.text}</p>
                </div>
                <ArrowRight size={14} className="lp-mode-arrow" />
              </motion.button>
            ))}
          </motion.div>

          <div className="lp-bottom-btns">
            <button type="button" className="btn primary lp-btn-lg" onClick={() => navigate("/")}>
              Start writing
              <ArrowRight size={15} strokeWidth={1.8} />
            </button>
            <button type="button" className="btn lp-btn-lg" disabled={launching !== null}
              onClick={() => void handleLaunchDemo()}>
              <Sparkles size={14} strokeWidth={1.6} />
              Try the demo
            </button>
            <span className="lp-start-hint">Inside the app, press <kbd className="kbd mono">?</kbd> for every shortcut.</span>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <strong>OpenNote</strong>
            <span>No ads. No tracking. Your notes stay on your device.</span>
          </div>
          <nav className="lp-footer-links" aria-label="Footer">
            <a href={GITHUB} target="_blank" rel="noreferrer"><GitHubMark size={13} /> Source on GitHub</a>
            <a href={`${GITHUB}/releases`} target="_blank" rel="noreferrer">Releases</a>
            <a href={`${GITHUB}/issues`} target="_blank" rel="noreferrer">Report a bug</a>
            {onOpenSettings && (
              <button type="button" onClick={onOpenSettings}>
                <Layers size={13} strokeWidth={1.6} /> Storage &amp; keys
              </button>
            )}
          </nav>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
