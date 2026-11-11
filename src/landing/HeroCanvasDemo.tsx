"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { Eraser, Play, RotateCcw } from "lucide-react";

type DemoPaper = "grid" | "cornell" | "iso" | "light";

interface DemoStroke {
  color: string;
  lightColor?: string;
  width: number;
  pts: [number, number, number][];
}

const LOGICAL_W = 920;
const LOGICAL_H = 400;

/** Hand-crafted seed strokes: damped harmonic wave + axes + callout box + equation annotation. */
function buildSeedStrokes(): DemoStroke[] {
  // 1. Horizontal & vertical axes
  const axisH: [number, number, number][] = [];
  for (let i = 0; i <= 24; i++) axisH.push([68 + i * 21, 215, 0.5]);
  const axisV: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) axisV.push([84, 78 + i * 16.5, 0.5]);

  // 2. Envelope upper curve (dashed-feel subtle amber)
  const envUp: [number, number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const x = 84 + t * 470;
    const y = 215 - 112 * Math.exp(-2.3 * t);
    envUp.push([x, y, 0.45]);
  }

  // 3. Damped oscillation wave in Signal Mint
  const wave: [number, number, number][] = [];
  for (let i = 0; i <= 110; i++) {
    const t = i / 110;
    const x = 84 + t * 475;
    const amp = 112 * Math.exp(-2.3 * t);
    const y = 215 - amp * Math.cos(t * Math.PI * 7.5);
    const p = 0.42 + 0.28 * Math.abs(Math.sin(t * Math.PI * 7.5));
    wave.push([x, y, p]);
  }

  // 4. Crisp callout frame on the right
  const cardRect: [number, number, number][] = [
    [612, 88, 0.55],
    [862, 88, 0.55],
    [862, 232, 0.55],
    [612, 232, 0.55],
    [612, 88, 0.55],
  ];

  // 5.Pointer arrow from wave peak to callout card
  const pointer: [number, number, number][] = [
    [224, 152, 0.5],
    [320, 108, 0.52],
    [470, 104, 0.55],
    [598, 128, 0.6],
  ];
  const arrowHead: [number, number, number][] = [
    [584, 118, 0.58],
    [600, 129, 0.62],
    [582, 137, 0.58],
  ];

  // 6. Handwritten underline accent under the equation inside the callout
  const underline: [number, number, number][] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    underline.push([638 + t * 188, 198 + Math.sin(t * Math.PI * 2) * 1.8, 0.48 + t * 0.15]);
  }

  return [
    { color: "#525866", lightColor: "#9BA1B0", width: 2.4, pts: axisH },
    { color: "#525866", lightColor: "#9BA1B0", width: 2.4, pts: axisV },
    { color: "#F5A524", lightColor: "#B45309", width: 2.2, pts: envUp },
    { color: "#FAFAFA", lightColor: "#16171C", width: 4.2, pts: wave },
    { color: "#F5A524", lightColor: "#B45309", width: 3.0, pts: cardRect },
    { color: "#A1A1AA", lightColor: "#5D6070", width: 2.8, pts: pointer },
    { color: "#A1A1AA", lightColor: "#5D6070", width: 2.8, pts: arrowHead },
    { color: "#F5A524", lightColor: "#B45309", width: 3.2, pts: underline },
  ];
}

const SWATCHES = [
  { label: "Amber", dark: "#F5A524", light: "#B45309" },
  { label: "White", dark: "#FAFAFA", light: "#16171C" },
  { label: "Grey", dark: "#A1A1AA", light: "#5D6070" },
  { label: "Chalk", dark: "#E8E9EE", light: "#16171C" },
  { label: "Coral", dark: "#FF8A5B", light: "#C2410C" },
];

function paintFreehand(
  ctx: CanvasRenderingContext2D,
  pts: [number, number, number][],
  color: string,
  width: number,
) {
  if (pts.length < 2) return;
  const outline = getStroke(pts, {
    size: width * 2,
    thinning: 0.45,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: false,
  });
  if (outline.length === 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintPaperBackground(ctx: CanvasRenderingContext2D, paper: DemoPaper) {
  const isLight = paper === "light";
  ctx.fillStyle = isLight ? "#F3F1EC" : "#13151C";
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  const lineCol = isLight ? "rgba(22, 23, 28, 0.08)" : "rgba(232, 233, 238, 0.055)";
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 1;

  if (paper === "grid" || paper === "light") {
    const step = 32;
    ctx.beginPath();
    for (let x = step; x < LOGICAL_W; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LOGICAL_H);
    }
    for (let y = step; y < LOGICAL_H; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_W, y);
    }
    ctx.stroke();
  } else if (paper === "cornell") {
    const step = 30;
    ctx.beginPath();
    for (let y = 56; y < LOGICAL_H - 54; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_W, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(245, 165, 36, 0.28)";
    ctx.beginPath();
    ctx.moveTo(210, 0);
    ctx.lineTo(210, LOGICAL_H - 54);
    ctx.moveTo(0, LOGICAL_H - 54);
    ctx.lineTo(LOGICAL_W, LOGICAL_H - 54);
    ctx.stroke();
  } else if (paper === "iso") {
    const step = 36;
    ctx.fillStyle = "rgba(79, 209, 197, 0.22)";
    for (let row = 0; row * (step * 0.866) < LOGICAL_H; row++) {
      const y = row * step * 0.866;
      const offset = (row % 2) * (step / 2);
      for (let x = offset; x < LOGICAL_W; x += step) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }

  // Callout tinted interior + crisp typography labels on the sheet
  ctx.fillStyle = isLight ? "rgba(180, 83, 9, 0.08)" : "rgba(245, 165, 36, 0.09)";
  ctx.fillRect(612, 88, 250, 144);

  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = isLight ? "#5D6070" : "#8A8F9E";
  ctx.fillText("LECTURE 04 · UNDERDAMPED HARMONIC RESPONSE", 84, 52);
  ctx.fillText("x(t)", 52, 88);
  ctx.fillText("t (ms) ->", 502, 236);

  ctx.fillStyle = isLight ? "#B45309" : "#F5A524";
  ctx.fillText("ENVELOPE  A·exp(-γt)", 634, 118);

  ctx.font = '600 19px "Space Grotesk", sans-serif';
  ctx.fillStyle = isLight ? "#16171C" : "#E8E9EE";
  ctx.fillText("m x'' + b x' + k x = 0", 634, 154);

  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillStyle = isLight ? "#16171C" : "#FAFAFA";
  ctx.fillText("ω_d = √(ω₀² − γ²)", 638, 184);
}

export function HeroCanvasDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paper, setPaper] = useState<DemoPaper>("grid");
  const [swatchIdx, setSwatchIdx] = useState(0);
  const [penWidth, setPenWidth] = useState(3.4);
  const [strokes, setStrokes] = useState<DemoStroke[]>(() => buildSeedStrokes());
  const [replayProgress, setReplayProgress] = useState(1);
  const [hasDrawn, setHasDrawn] = useState(false);

  const drawingRef = useRef<{ pts: [number, number, number][]; lastT: number } | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const isLight = paper === "light";
  const activeColor = isLight ? SWATCHES[swatchIdx].light : SWATCHES[swatchIdx].dark;

  const renderCanvas = useCallback((prog = replayProgress) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetW = Math.round(LOGICAL_W * dpr);
    const targetH = Math.round(LOGICAL_H * dpr);
    if (c.width !== targetW || c.height !== targetH) {
      c.width = targetW;
      c.height = targetH;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPaperBackground(ctx, paper);

    const list = strokesRef.current;
    const totalPts = list.reduce((acc, s) => acc + s.pts.length, 0);
    let budget = Math.ceil(totalPts * prog);

    for (const s of list) {
      if (budget <= 0) break;
      const slice = prog >= 1 ? s.pts : s.pts.slice(0, Math.max(2, Math.min(s.pts.length, budget)));
      const col = isLight && s.lightColor ? s.lightColor : s.color;
      paintFreehand(ctx, slice, col, s.width);
      if (prog < 1 && budget < s.pts.length && slice.length > 0) {
        const tip = slice[slice.length - 1];
        ctx.beginPath();
        ctx.fillStyle = "#F5A524";
        ctx.arc(tip[0], tip[1], 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      budget -= s.pts.length;
    }

    if (drawingRef.current && drawingRef.current.pts.length > 1) {
      paintFreehand(ctx, drawingRef.current.pts, activeColor, penWidth);
    }
  }, [paper, isLight, activeColor, penWidth, replayProgress]);

  // Smooth stroke-by-stroke entrance animation on mount
  const triggerReplay = useCallback(() => {
    if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") return;
    const start = performance.now();
    const dur = 950;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 2.4);
      setReplayProgress(eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setReplayProgress(0.04);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const cancel = triggerReplay();
    return () => cancel?.();
  }, [triggerReplay]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, strokes]);

  const toCanvasPt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / (r.width || LOGICAL_W)) * LOGICAL_W;
    const y = ((e.clientY - r.top) / (r.height || LOGICAL_H)) * LOGICAL_H;
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.55;
    return [x, y, p];
  };


  return (
    <div className="lp-stage-frame">
      <div className="lp-stage-bar">
        <div className="lp-stage-dots" aria-hidden>
          <span />
          <span />
          <span />
          <span className="lp-stage-path">Physics 201 · Damped oscillator</span>
        </div>

        <div className="lp-stage-tools" role="toolbar" aria-label="Interactive hero canvas tools">
          <div className="lp-seg" role="group" aria-label="Demo paper">
            {([
              ["grid", "Grid"],
              ["cornell", "Cornell"],
              ["iso", "Isometric"],
              ["light", "Light"],
            ] as [DemoPaper, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={paper === id ? "on" : ""}
                onClick={() => setPaper(id)}>
                {label}
              </button>
            ))}
          </div>

          <div className="lp-stage-swatches" role="group" aria-label="Demo ink colour">
            {SWATCHES.map((sw, idx) => (
              <button
                key={sw.label}
                type="button"
                aria-label={`Demo ${sw.label} ink`}
                className={`lp-dot-swatch ${swatchIdx === idx ? "on" : ""}`}
                style={{ background: isLight ? sw.light : sw.dark }}
                onClick={() => setSwatchIdx(idx)}
              />
            ))}
          </div>

          <div className="lp-seg" role="group" aria-label="Demo stroke width">
            {([
              [2.2, "Fine"],
              [3.4, "Med"],
              [5.5, "Bold"],
            ] as [number, string][]).map(([w, lbl]) => (
              <button key={lbl} type="button" className={penWidth === w ? "on" : ""} onClick={() => setPenWidth(w)}>
                {lbl}
              </button>
            ))}
          </div>

          <button type="button" className="lp-mini-btn" onClick={() => triggerReplay()} title="Replay stroke animation">
            <Play size={12} strokeWidth={1.8} />Replay
          </button>
          <button
            type="button"
            className="lp-mini-btn"
            onClick={() => {
              setStrokes(buildSeedStrokes());
              setHasDrawn(false);
            }}
            title="Reset demo sheet">
            <RotateCcw size={12} strokeWidth={1.8} />Reset
          </button>
          <button
            type="button"
            className="lp-mini-btn"
            onClick={() => {
              setStrokes([]);
              setHasDrawn(true);
            }}
            title="Clear sheet">
            <Eraser size={12} strokeWidth={1.8} />Clear
          </button>
        </div>
      </div>

      <div className="lp-canvas-wrap">
        <canvas
          ref={canvasRef}
          data-testid="hero-ink-canvas"
          className="lp-hero-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setHasDrawn(true);
            setReplayProgress(1);
            drawingRef.current = { pts: [toCanvasPt(e)], lastT: performance.now() };
            renderCanvas(1);
          }}
          onPointerMove={(e) => {
            const cur = drawingRef.current;
            if (!cur) return;
            cur.pts.push(toCanvasPt(e));
            cur.lastT = performance.now();
            renderCanvas(1);
          }}
          onPointerUp={() => {
            const cur = drawingRef.current;
            if (!cur) return;
            drawingRef.current = null;
            if (cur.pts.length > 1) {
              setStrokes((prev) => [
                ...prev,
                {
                  color: SWATCHES[swatchIdx].dark,
                  lightColor: SWATCHES[swatchIdx].light,
                  width: penWidth,
                  pts: cur.pts,
                },
              ]);
            }
          }}
          onPointerCancel={() => {
            drawingRef.current = null;
            renderCanvas(1);
          }}
        />
        {!hasDrawn && (
          <div className="lp-canvas-badge" aria-hidden>
            Pen, mouse or finger
          </div>
        )}
      </div>

      <div className="lp-stage-telemetry">
        <span>{strokes.length} {strokes.length === 1 ? "stroke" : "strokes"} on this page</span>
        <span className="lp-tel-ok">Saved on this device, not in a cloud</span>
      </div>
    </div>
  );
}
