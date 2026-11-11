"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, Code2, GraduationCap, Pause, Play, Shapes } from "lucide-react";

/**
 * 21st.dev-style Spotlight Card: writes cursor (x, y) directly to CSS custom properties
 * so the 1px specular border illumination tracks at 120Hz with zero React re-renders.
 */
export function SpotlightCard({
  className = "",
  tag,
  title,
  desc,
  icon,
  children,
}: {
  className?: string;
  tag: string;
  title: string;
  desc: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  return (
    <article
      ref={ref}
      className={`lp-bento-card ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}>
      <header className="lp-bento-head">
        <div className="lp-bento-eyebrow">
          <span>{tag}</span>
          <span className="lp-bento-icon">{icon}</span>
        </div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </header>
      <div className="lp-bento-body">{children}</div>
    </article>
  );
}

const FILL_SWATCHES = [
  { name: "Amber", hex: "#F5A524" },
  { name: "White", hex: "#FAFAFA" },
  { name: "Grey", hex: "#A1A1AA" },
  { name: "Coral", hex: "#FF8A5B" },
];

function ShapeSnapDemo() {
  const [snapped, setSnapped] = useState(true);
  const [fillHex, setFillHex] = useState("#A1A1AA");
  const [solidFill, setSolidFill] = useState(false);
  const [dashed, setDashed] = useState(false);

  const fillAlpha = solidFill ? 0.86 : 0.36;

  return (
    <div className="lp-demo-box">
      <div className="lp-demo-toolbar">
        <div className="lp-seg">
          <button type="button" className={!snapped ? "on" : ""} onClick={() => setSnapped(false)}>
            Raw Sketch
          </button>
          <button type="button" className={snapped ? "on" : ""} onClick={() => setSnapped(true)}>
            0.4s Snap
          </button>
        </div>

        <div className="lp-stage-swatches" role="group" aria-label="Shape demo fill swatches">
          {FILL_SWATCHES.map((s) => (
            <button
              key={s.name}
              type="button"
              aria-label={`Demo fill ${s.name}`}
              className={`lp-sq-swatch ${fillHex === s.hex ? "on" : ""}`}
              style={{ background: s.hex }}
              onClick={() => setFillHex(s.hex)}
            />
          ))}
        </div>

        <button
          type="button"
          className={`lp-mini-btn mono ${solidFill ? "on" : ""}`}
          aria-label="Bento solid fill"
          aria-pressed={solidFill}
          onClick={() => setSolidFill((v) => !v)}>
          {solidFill ? "Solid 90%" : "Tint 42%"}
        </button>

        <button
          type="button"
          className={`lp-mini-btn mono ${dashed ? "on" : ""}`}
          aria-pressed={dashed}
          onClick={() => setDashed((v) => !v)}>
          Dashed
        </button>
      </div>

      <svg viewBox="0 0 480 156" className="lp-demo-svg" role="img" aria-label="Vector shape snap preview">
        {!snapped ? (
          <>
            {/* Hand-drawn wobbly rectangle, arrow, and triangle */}
            <path
              d="M 36 36 Q 92 29 164 38 Q 169 78 161 122 Q 98 128 34 119 Q 31 76 36 36 Z"
              fill={fillHex}
              fillOpacity={fillAlpha * 0.45}
              stroke="#E8E9EE"
              strokeWidth="2.6"
              strokeDasharray={dashed ? "8 6" : undefined}
              strokeLinejoin="round"
            />
            <path
              d="M 182 79 Q 235 73 288 81"
              fill="none"
              stroke="#F5A524"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeDasharray={dashed ? "8 6" : undefined}
            />
            <path d="M 274 69 L 291 81 L 272 91" fill="none" stroke="#F5A524" strokeWidth="2.8" strokeLinecap="round" />
            <path
              d="M 366 32 Q 402 78 438 122 Q 368 126 306 120 Q 336 74 366 32 Z"
              fill={fillHex}
              fillOpacity={fillAlpha * 0.45}
              stroke="#E8E9EE"
              strokeWidth="2.6"
              strokeDasharray={dashed ? "8 6" : undefined}
            />
          </>
        ) : (
          <>
            {/* Snapped razor-sharp geometry with independent fill & draggable endpoint handles */}
            <rect
              x="34"
              y="34"
              width="132"
              height="88"
              rx="10"
              fill={fillHex}
              fillOpacity={fillAlpha}
              stroke="#E8E9EE"
              strokeWidth="2.6"
              strokeDasharray={dashed ? "8 6" : undefined}
            />
            <line
              x1="184"
              y1="78"
              x2="278"
              y2="78"
              stroke="#F5A524"
              strokeWidth="2.8"
              strokeDasharray={dashed ? "8 6" : undefined}
              strokeLinecap="round"
            />
            <polygon points="294,78 275,67 275,89" fill="#F5A524" stroke="#F5A524" strokeWidth="1.5" />
            <circle cx="184" cy="78" r="4.5" fill="#121318" stroke="#F5A524" strokeWidth="2" />
            <circle cx="294" cy="78" r="4.5" fill="#121318" stroke="#F5A524" strokeWidth="2" />
            <polygon
              points="372,30 440,122 304,122"
              fill={fillHex}
              fillOpacity={fillAlpha}
              stroke="#E8E9EE"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "8 6" : undefined}
            />
          </>
        )}
        <text x="58" y="83" fill="#E8E9EE" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="600">
          Σ F = m·a
        </text>
        <text x="351" y="103" fill="#E8E9EE" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="600">
          ΔV = 0
        </text>
      </svg>
    </div>
  );
}

function AudioInkReplayDemo() {
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(5400);
  const maxMs = 10_000;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setMs((prev) => {
        if (prev >= maxMs) {
          setPlaying(false);
          return maxMs;
        }
        return prev + 80;
      });
    }, 50);
    return () => clearInterval(id);
  }, [playing]);

  const frac = Math.max(0.02, Math.min(1, ms / maxMs));
  const pathLen = 520;
  const dashOffset = pathLen * (1 - frac);
  // Tip cursor tracks along x from 28 -> 436
  const tipX = 28 + frac * 408;
  const tipY = 66 - Math.sin(frac * Math.PI * 5) * 26;

  return (
    <div className="lp-demo-box">
      <div className="lp-demo-toolbar">
        <button
          type="button"
          className="lp-mini-btn on"
          aria-label={playing ? "Pause ink replay demo" : "Play ink replay demo"}
          onClick={() => {
            if (ms >= maxMs) setMs(0);
            setPlaying((p) => !p);
          }}>
          {playing ? <Pause size={12} /> : <Play size={12} />}
          {playing ? "Pause" : "Replay"}
        </button>
        <input
          type="range"
          aria-label="Scrub ink replay timeline"
          min={0}
          max={maxMs}
          step={100}
          value={ms}
          onChange={(e) => {
            setPlaying(false);
            setMs(Number(e.target.value));
          }}
          className="lp-slider"
        />
        <span className="mono lp-dim-tag">
          00:{String(Math.floor(ms / 1000)).padStart(2, "0")} / 00:10
        </span>
      </div>

      <svg viewBox="0 0 464 132" className="lp-demo-svg" role="img" aria-label="Point-by-point audio ink replay">
        {/* Ghost preview of full stroke */}
        <path
          d="M 28 66 C 72 22, 112 110, 156 66 C 200 22, 240 110, 284 66 C 328 22, 368 110, 436 66"
          fill="none"
          stroke="rgba(232, 233, 238, 0.14)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* Active revealed stroke up to playhead */}
        <path
          d="M 28 66 C 72 22, 112 110, 156 66 C 200 22, 240 110, 284 66 C 328 22, 368 110, 436 66"
          fill="none"
          stroke="#FAFAFA"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={pathLen}
          strokeDashoffset={dashOffset}
        />
        {frac < 0.99 && (
          <>
            <circle cx={tipX} cy={tipY} r="9" fill="rgba(245, 165, 36, 0.25)" />
            <circle cx={tipX} cy={tipY} r="4" fill="#F5A524" />
          </>
        )}
        <text x="28" y="118" fill="#8A8F9E" fontFamily="JetBrains Mono, monospace" fontSize="10.5">
          pointerDown offsetMs + per-point Float32 Δt · Tap any stroke to seek audio
        </text>
      </svg>
    </div>
  );
}

function LiveOscillatorDemo() {
  const [freq, setFreq] = useState(2.8);
  const [damp, setDamp] = useState(0.32);

  const { wavePath, envPath } = useMemo(() => {
    let w = "";
    let e = "";
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = 18 + t * 428;
      const env = 44 * Math.exp(-damp * 5.2 * t);
      const y = 58 - env * Math.cos(t * Math.PI * 2 * freq);
      const ey = 58 - env;
      w += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
      e += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ey.toFixed(1)} `;
    }
    return { wavePath: w, envPath: e };
  }, [freq, damp]);

  return (
    <div className="lp-demo-box">
      <svg viewBox="0 0 464 116" className="lp-demo-svg" role="img" aria-label="Live sandboxed harmonic simulation">
        <line x1="18" y1="58" x2="446" y2="58" stroke="rgba(232,233,238,0.12)" strokeWidth="1" />
        <path d={envPath} fill="none" stroke="rgba(245, 165, 36, 0.5)" strokeWidth="1.4" strokeDasharray="4 4" />
        <path d={wavePath} fill="none" stroke="#FAFAFA" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="lp-dual-sliders mono">
        <label>
          <span>FREQ {freq.toFixed(1)} Hz</span>
          <input
            type="range"
            aria-label="Oscillator frequency"
            min="1"
            max="5"
            step="0.2"
            value={freq}
            onChange={(e) => setFreq(Number(e.target.value))}
            className="lp-slider"
          />
        </label>
        <label>
          <span>DAMP ζ={damp.toFixed(2)}</span>
          <input
            type="range"
            aria-label="Oscillator damping"
            min="0"
            max="0.8"
            step="0.04"
            value={damp}
            onChange={(e) => setDamp(Number(e.target.value))}
            className="lp-slider"
          />
        </label>
      </div>
    </div>
  );
}

const SARVAM_SAMPLES: Record<
  "en" | "bn" | "hi" | "tr",
  { tab: string; code: string; mode: string; text: string }
> = {
  en: {
    tab: "English",
    code: "en-IN",
    mode: "transcribe",
    text: "Conservation of angular momentum holds whenever net external torque equals zero.",
  },
  bn: {
    tab: "Bengali",
    code: "bn-IN",
    mode: "transcribe",
    text: "বাহ্যিক টর্ক শূন্য হলে কৌণিক ভরবেগ সর্বদা সংরক্ষিত থাকে (L = I·ω = ধ্রুবক)।",
  },
  hi: {
    tab: "Hindi",
    code: "hi-IN",
    mode: "transcribe",
    text: "बाह्य बल-आघूर्ण शून्य होने पर कोणीय संवेग सदैव संरक्षित रहता है।",
  },
  tr: {
    tab: "Translate -> EN",
    code: "bn-IN -> en",
    mode: "translate",
    text: "[Spoken in Bengali] -> External torque zero implies angular momentum L = Iω remains constant.",
  },
};

function SarvamSttDemo() {
  const [lang, setLang] = useState<"en" | "bn" | "hi" | "tr">("en");
  const cur = SARVAM_SAMPLES[lang];

  return (
    <div className="lp-demo-box">
      <div className="lp-demo-toolbar" role="tablist" aria-label="Sarvam speech language preview">
        {(Object.keys(SARVAM_SAMPLES) as ("en" | "bn" | "hi" | "tr")[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={lang === k}
            className={`lp-mini-btn ${lang === k ? "on" : ""}`}
            onClick={() => setLang(k)}>
            {SARVAM_SAMPLES[k].tab}
          </button>
        ))}
      </div>
      <div className="lp-stt-card">
        <div className="lp-stt-meta mono">
          <span>saaras:v3 · {cur.code}</span>
          <span>16kHz PCM WAV · &le;25s chunks</span>
        </div>
        <p className="lp-stt-out">{cur.text}</p>
      </div>
    </div>
  );
}

function TapeOcclusionDemo() {
  const [peeled, setPeeled] = useState(false);
  const [grade, setGrade] = useState<"again" | "hard" | "good" | "easy">("good");

  const intervals = {
    again: "10 min · Lapsed",
    hard: "2 days · S = 2.4",
    good: "7 days · S = 6.8",
    easy: "19 days · S = 18.5",
  };

  return (
    <div className="lp-demo-box">
      <div className="lp-tape-equation">
        <span className="mono lp-eq-prefix">Euler&apos;s identity:</span>
        <div className="lp-tape-target">
          <code className="mono lp-eq-formula">e^(iπ) + 1 = 0</code>
          <button
            type="button"
            aria-label="Peel study tape"
            className={`lp-tape-strip ${peeled ? "peeled" : ""}`}
            onClick={() => setPeeled((v) => !v)}>
            <span className="mono">{peeled ? "COVER" : "TAP TO PEEL TAPE"}</span>
          </button>
        </div>
      </div>

      {peeled ? (
        <div className="lp-srs-row">
          <div className="lp-seg">
            {(["again", "hard", "good", "easy"] as const).map((g) => (
              <button key={g} type="button" className={grade === g ? "on" : ""} onClick={() => setGrade(g)}>
                {g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
          <span className="mono lp-dim-tag">FSRS-6 interval: {intervals[grade]}</span>
        </div>
      ) : (
        <p className="mono lp-dim-tag" style={{ margin: "8px 0 0" }}>
          Drag Study Tape [B] over any formula -&gt; 1-click occlusion flashcard
        </p>
      )}
    </div>
  );
}

export function BentoDemos() {
  return (
    <div className="lp-bento-grid">
      <SpotlightCard
        className="lp-span-7"
        tag="Shapes"
        title="Hold the pen still and your scribble becomes a clean shape."
        desc="Pause at the end of a stroke to snap lines, arrows, triangles, diamonds and boxes, then fill them with a tint or solid colour."
        icon={<Shapes size={14} strokeWidth={1.6} />}>
        <ShapeSnapDemo />
      </SpotlightCard>

      <SpotlightCard
        className="lp-span-5"
        tag="Lecture replay"
        title="Tap a word you wrote to hear what was said."
        desc="Record a class while you write. Later, tap any line of ink and the audio jumps there, while your strokes replay in time."
        icon={<Play size={14} strokeWidth={1.6} />}>
        <AudioInkReplayDemo />
      </SpotlightCard>

      <SpotlightCard
        className="lp-span-5"
        tag="Live pages"
        title="Put a working simulation between your pages."
        desc="Paste HTML, SVG or React and it runs on its own page, safely sandboxed. Switch to Annotate to write on top of it."
        icon={<Code2 size={14} strokeWidth={1.6} />}>
        <LiveOscillatorDemo />
      </SpotlightCard>

      <SpotlightCard
        className="lp-span-4"
        tag="Speech to notes"
        title="Lectures in 11 Indian languages and English, turned into text."
        desc="Keep the original script, mix languages the way people speak, or translate to English as you go."
        icon={<AudioLines size={14} strokeWidth={1.6} />}>
        <SarvamSttDemo />
      </SpotlightCard>

      <SpotlightCard
        className="lp-span-3"
        tag="Flashcards"
        title="Cover it with tape. Test yourself."
        desc="Hide a term on your page, peel to check, or turn the tape into flashcards that come back on schedule."
        icon={<GraduationCap size={14} strokeWidth={1.6} />}>
        <TapeOcclusionDemo />
      </SpotlightCard>
    </div>
  );
}
