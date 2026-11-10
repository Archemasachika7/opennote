"use client";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Command,
  Cpu,
  Download,
  FilePlus2,
  GraduationCap,
  HardDrive,
  Layers,
  LayoutDashboard,
  Moon,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import { navigate } from "../App";
import { db, type DocKind } from "../store/schema";
import { createNotebook, listNotebooks } from "../store/notebooks";
import { useLive } from "../store/useLive";
import { createStarterNotebook } from "../library/demoNotebook";
import { useTheme } from "../ui/theme";
import { platform } from "../platform/port";
import { HeroCanvasDemo } from "./HeroCanvasDemo";
import { BentoDemos } from "./BentoDemos";
import "./landing.css";

const KEYCAPS: { key: string; name: string; detail: string }[] = [
  { key: "P", name: "Pressure Pen", detail: "Ballpoint, fountain & brush strokes; hold 0.4s to snap geometry or scribble back-and-forth to erase." },
  { key: "H", name: "Chisel Highlighter", detail: "Layered translucent ink painted underneath pen strokes so handwriting stays crisp." },
  { key: "S", name: "Vector Shapes", detail: "Lines, arrows, rectangles, ellipses, triangles, diamonds & stars with Tint/Solid interior fills." },
  { key: "L", name: "Smart Lasso", detail: "Move, uniform-scale, rotate, recolour, save reusable STEM stamps, or turn ink into flashcards." },
  { key: "B", name: "Study Tape", detail: "Mask formulas or labels right on the page; tap to peel during review or batch-export to FSRS cards." },
  { key: "K", name: "Laser Trail", detail: "Fading phosphor pointer for live teaching and screen-shares — never persisted to disk." },
  { key: "R", name: "Drafting Ruler", detail: "Draggable protractor straight-edge; strokes started near an edge snap to exact angles." },
  { key: "Ctrl K", name: "Command Jump", detail: "Instant full-text search across notebooks, rich text pages, flashcards, and studio actions." },
];

const ARCH_SPECS = [
  {
    code: "ARCH.01",
    metric: "< 4 ms",
    title: "Wet / Dry Dual-Canvas Pipeline",
    body: "Active stylus input renders on an isolated wet canvas with pointer prediction while committed strokes cache Path2D geometry on the dry layer.",
    icon: <Cpu size={15} strokeWidth={1.6} />,
  },
  {
    code: "ARCH.02",
    metric: "16 B / pt",
    title: "Binary Float32 Stroke Storage",
    body: "Each sample packs [x, y, pressure, Δt] into raw Float32Array buffers inside IndexedDB — thousands of handwritten strokes hydrate in milliseconds.",
    icon: <HardDrive size={15} strokeWidth={1.6} />,
  },
  {
    code: "ARCH.03",
    metric: "0 Auth",
    title: "Local-First, Zero Cloud Lock-In",
    body: "No account gate, no telemetry beacons, no recurring paywall. Your browser's persistent storage owns every byte from the first keystroke.",
    icon: <Shield size={15} strokeWidth={1.6} />,
  },
  {
    code: "ARCH.04",
    metric: ".opennote",
    title: "Portable Archives & Vector PDF",
    body: "Import multi-page PDFs to annotate at full resolution, export print-ready PDFs or JPGs, and back up full notebooks as open ZIP bundles.",
    icon: <Download size={15} strokeWidth={1.6} />,
  },
];

function CrosshairDivider() {
  return (
    <div className="lp-divider" aria-hidden>
      <span className="lp-cross left" />
      <span className="lp-cross right" />
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
  const [activeKeyIdx, setActiveKeyIdx] = useState(0);
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

  return (
    <div className="lp-root" data-testid="landing-page">
      <div className="lp-bg-grid" aria-hidden />

      {/* Sticky Architectural Top Bar */}
      <header className="lp-header">
        <div className="lp-header-inner">
          <div className="lp-brand">
            <svg className="lp-logo" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect x="3" y="2" width="26" height="28" rx="5" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
              <path d="M3 7C3 4.23858 5.23858 2 8 2H9.5V30H8C5.23858 30 3 27.7614 3 25V7Z" fill="var(--accent)" />
              <path d="M13 19.5C15.2 15 17.5 22.5 20.4 16.8C22 13.8 23.5 18 25.2 15.5" stroke="var(--live)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24.5" cy="8.5" r="2" fill="var(--live)" />
            </svg>
            <span className="lp-brand-name">OpenNote</span>
            <span className="lp-version mono">LOCAL-FIRST STUDIO</span>
          </div>

          <nav className="lp-nav" aria-label="Landing sections">
            <button type="button" onClick={() => scrollToSection("lp-workbench")}>Workbench</button>
            <button type="button" onClick={() => scrollToSection("lp-primitives")}>Primitives</button>
            <button type="button" onClick={() => scrollToSection("lp-architecture")}>Architecture</button>
            <button type="button" onClick={() => scrollToSection("lp-shortcuts")}>Shortcuts</button>
          </nav>

          <div className="lp-header-actions">
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
              title={resolvedTheme === "dark" ? "Switch to Light drafting paper" : "Switch to Midnight Studio dark"}
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

      {/* Main Architectural Rail Shell */}
      <main className="lp-shell">
        {/* HERO SECTION */}
        <section className="lp-hero">
          <motion.div
            className="lp-hero-copy"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
            <div className="lp-eyebrow mono">
              <span className="lp-status-dot" />
              <span>ZERO ACCOUNT WALL</span>
              <span className="lp-dot-sep">·</span>
              <span>OFFLINE PWA</span>
              <span className="lp-dot-sep">·</span>
              <span>INDEXEDDB NATIVE</span>
            </div>

            <h1 className="lp-title">
              Handwritten ink, live simulations, and spaced recall on one page.
            </h1>

            <p className="lp-subtitle">
              An engineering-grade digital notebook built for equations, lectures, and technical thinking.
              Sketch at 120Hz, sync strokes to voice and Sarvam AI transcripts, run interactive code artifacts
              beside your notes, and review with FSRS-4.5 — stored entirely on your device.
            </p>

            <div className="lp-hero-actions">
              <button
                type="button"
                className="btn primary lp-btn-lg"
                onClick={() => navigate("/")}>
                Enter Studio
                {notebookCount > 0 && (
                  <span className="lp-count-pill mono">{notebookCount}</span>
                )}
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                className="btn lp-btn-lg"
                disabled={launching !== null}
                onClick={() => void handleCreateDoc("notebook")}>
                <FilePlus2 size={15} strokeWidth={1.6} />
                New Blank Page
              </button>

              <button
                type="button"
                className="btn ghost lp-btn-lg lp-demo-btn"
                disabled={launching !== null}
                onClick={() => void handleLaunchDemo()}>
                <Sparkles size={15} strokeWidth={1.6} />
                Open 3-Page Demo
              </button>
            </div>
          </motion.div>

          <motion.div
            id="lp-workbench"
            className="lp-hero-stage"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <HeroCanvasDemo />
          </motion.div>
        </section>

        <CrosshairDivider />

        {/* INTERACTIVE BENTO PRIMITIVES */}
        <section id="lp-primitives" className="lp-section">
          <div className="lp-section-head">
            <span className="mono lp-sec-kicker">01 // INTERACTIVE PRIMITIVES</span>
            <div className="lp-sec-title-row">
              <h2>Five studio instruments. Every card below is live.</h2>
              <p>
                Test shape snapping, scrub lecture ink replay, tune a harmonic wave, switch Indic scripts,
                or peel back Study Tape before opening a single menu.
              </p>
            </div>
          </div>

          <BentoDemos />
        </section>

        <CrosshairDivider />

        {/* ARCHITECTURAL ENGINEERING LEDGER */}
        <section id="lp-architecture" className="lp-section lp-arch-section">
          <div className="lp-section-head">
            <span className="mono lp-sec-kicker">02 // SYSTEM ARCHITECTURE</span>
            <div className="lp-sec-title-row">
              <h2>Engineered like a native instrument, delivered as a URL.</h2>
              <p>
                No loading spinners waiting on a remote database. Every stroke, PDF page, audio blob,
                and flashcard lives in structured local IndexedDB tables with instant offline boot.
              </p>
            </div>
          </div>

          <div className="lp-arch-grid">
            {ARCH_SPECS.map((s) => (
              <div key={s.code} className="lp-arch-cell">
                <div className="lp-arch-top mono">
                  <span>{s.code}</span>
                  <span className="lp-arch-icon">{s.icon}</span>
                </div>
                <div className="lp-arch-metric mono">{s.metric}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <CrosshairDivider />

        {/* THREE WORKSPACES + TACTILE KEYBOARD MATRIX */}
        <section id="lp-shortcuts" className="lp-section">
          <div className="lp-dual-band">
            <div className="lp-modes-col">
              <span className="mono lp-sec-kicker">03 // DOCUMENT SURFACES</span>
              <h2>Three workspaces, one unified library.</h2>
              <div className="lp-mode-list">
                <button type="button" className="lp-mode-card" onClick={() => void handleCreateDoc("notebook")}>
                  <div className="lp-mode-icon amber"><BookOpen size={16} strokeWidth={1.6} /></div>
                  <div>
                    <strong>Paginated Notebooks</strong>
                    <p>Mix handwritten Ink pages, TipTap Rich Text + LaTeX math, imported PDFs, and Live HTML artifacts in a single binder.</p>
                  </div>
                  <ArrowRight size={14} className="lp-mode-arrow" />
                </button>

                <button type="button" className="lp-mode-card" onClick={() => void handleCreateDoc("whiteboard")}>
                  <div className="lp-mode-icon mint"><LayoutDashboard size={16} strokeWidth={1.6} /></div>
                  <div>
                    <strong>Infinite Whiteboards</strong>
                    <p>Unbounded pan-and-zoom spatial canvas with live minimap, multi-layer locking, and reusable STEM diagram stamps.</p>
                  </div>
                  <ArrowRight size={14} className="lp-mode-arrow" />
                </button>

                <button type="button" className="lp-mode-card" onClick={() => void handleCreateDoc("studyset")}>
                  <div className="lp-mode-icon cyan"><GraduationCap size={16} strokeWidth={1.6} /></div>
                  <div>
                    <strong>Smart Learn Study Sets</strong>
                    <p>SM-2 &amp; FSRS-4.5 spaced repetition decks fed directly from Study Tape strips and lassoed diagram occlusions.</p>
                  </div>
                  <ArrowRight size={14} className="lp-mode-arrow" />
                </button>
              </div>
            </div>

            <div className="lp-keys-col">
              <span className="mono lp-sec-kicker">04 // MUSCLE MEMORY</span>
              <h2>Single-key studio ergonomics.</h2>
              <p className="lp-keys-sub">
                Select any keycap to inspect its tool behaviour. Inside the studio, press <kbd className="kbd mono">?</kbd> anytime.
              </p>

              <div className="lp-keycap-rack" role="list" aria-label="Studio keyboard shortcuts">
                {KEYCAPS.map((item, idx) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`lp-keycap mono ${activeKeyIdx === idx ? "on" : ""}`}
                    onMouseEnter={() => setActiveKeyIdx(idx)}
                    onClick={() => setActiveKeyIdx(idx)}>
                    <span className="lp-keycap-top">{item.key}</span>
                    <span className="lp-keycap-lbl">{item.name.split(" ")[1] ?? item.name}</span>
                  </button>
                ))}
              </div>

              <div className="lp-keycap-readout">
                <div className="lp-keycap-readout-head mono">
                  <span className="lp-key-badge">[{KEYCAPS[activeKeyIdx].key}]</span>
                  <strong>{KEYCAPS[activeKeyIdx].name}</strong>
                </div>
                <p>{KEYCAPS[activeKeyIdx].detail}</p>
              </div>
            </div>
          </div>
        </section>

        <CrosshairDivider />

        {/* BOTTOM ZERO-FRICTION LAUNCH BAR */}
        <section className="lp-bottom-cta">
          <div>
            <span className="mono lp-sec-kicker">READY IN 0 SECONDS · NO SIGN-UP</span>
            <h2>Your browser is already the studio.</h2>
          </div>
          <div className="lp-bottom-btns">
            {onOpenSettings && (
              <button type="button" className="btn" onClick={onOpenSettings}>
                <Layers size={14} strokeWidth={1.6} />
                Storage &amp; Sarvam Key
              </button>
            )}
            <button type="button" className="btn" onClick={() => void handleLaunchDemo()}>
              <Sparkles size={14} strokeWidth={1.6} />
              Starter Demo
            </button>
            <button type="button" className="btn primary lp-btn-lg" onClick={() => navigate("/")}>
              Open Studio Library
              <ArrowRight size={15} strokeWidth={1.8} />
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-footer mono">
        <div className="lp-footer-inner">
          <span>OPENNOTE · OFFLINE-FIRST DIGITAL NOTEBOOK</span>
          <span>MIDNIGHT STUDIO PALETTE · ZERO CLOUD TELEMETRY</span>
        </div>
      </footer>
    </div>
  );
}
