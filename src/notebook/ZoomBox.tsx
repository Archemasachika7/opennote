import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CornerDownLeft, Maximize2, X } from "lucide-react";
import { PAGE_SIZE, type Notebook, type Page } from "../store/schema";
import { InkLayer } from "../ink/InkLayer";
import { drawPaperTemplate, usePageTemplate } from "../store/templates";

const I = { size: 14, strokeWidth: 1.5 } as const;

const BOX_LOGICAL_W = 540;
const BOX_LOGICAL_H = 196;
const MARGIN_LEFT = 72;
const ADVANCE_X = 360;
const ADVANCE_Y = 124;

/**
 * Goodnotes-style Magnified Zoom Writing Window with Auto-Advance:
 * Magnifies a target rectangle `(boxX, boxY, 540, 196)` of the current Ink page by ~2.2x at the
 * bottom of the workspace. Writing into the shaded right-hand Auto-Advance zone automatically
 * glides the target box forward along the line (and wraps to the next ruled line at page edge).
 */
export function ZoomWritingWindow({
  page, notebook, onClose,
}: {
  page: Page;
  notebook: Notebook;
  onClose: () => void;
}) {
  const [boxPos, setBoxPos] = useState<{ x: number; y: number }>({ x: MARGIN_LEFT, y: 156 });
  const padWrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [padW, setPadW] = useState(720);
  const tpl = usePageTemplate(page);

  const pageH = page.kind === "ink" ? page.size?.h ?? PAGE_SIZE.h : PAGE_SIZE.h;

  useEffect(() => {
    const el = padWrapRef.current;
    if (!el) return;
    const measure = () => setPadW(Math.max(320, Math.min(960, el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = padW / BOX_LOGICAL_W;
  const padH = Math.round(BOX_LOGICAL_H * zoom);

  // Paint magnified paper template underneath the Zoom Box InkLayer
  useEffect(() => {
    const c = bgRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(padW * dpr);
    c.height = Math.round(padH * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -boxPos.x * dpr * zoom, -boxPos.y * dpr * zoom);
    ctx.fillStyle = notebook.paper === "light" ? "#F7F6F2" : "#141519";
    ctx.fillRect(boxPos.x, boxPos.y, BOX_LOGICAL_W, BOX_LOGICAL_H);
    drawPaperTemplate(ctx, tpl, PAGE_SIZE.w, pageH, notebook.paper);
  }, [padW, padH, zoom, boxPos.x, boxPos.y, tpl, notebook.paper, pageH]);

  const advanceRight = () => {
    setBoxPos((prev) => {
      if (prev.x + ADVANCE_X + BOX_LOGICAL_W * 0.65 <= PAGE_SIZE.w - 40) {
        return { x: prev.x + ADVANCE_X, y: prev.y };
      }
      return { x: MARGIN_LEFT, y: Math.min(pageH - BOX_LOGICAL_H - 32, prev.y + ADVANCE_Y) };
    });
  };

  const advanceLeft = () => {
    setBoxPos((prev) => ({ x: Math.max(24, prev.x - ADVANCE_X), y: prev.y }));
  };

  const newLine = () => {
    setBoxPos((prev) => ({
      x: MARGIN_LEFT,
      y: Math.min(pageH - BOX_LOGICAL_H - 32, prev.y + ADVANCE_Y),
    }));
  };

  // Auto-advance when a stroke finishes inside the right-hand 22% zone
  const enteredAdvanceZone = useRef(false);

  return (
    <section className="zoom-box" role="region" aria-label="Zoom writing window" data-testid="zoom-writing-window">
      <header className="zoom-box-bar">
        <span className="mono small" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Maximize2 size={13} strokeWidth={1.5} color="var(--accent)" />
          Zoom Window ({Math.round(zoom * 100)}%) · Line y={Math.round(boxPos.y)}
        </span>
        <div className="zoom-box-controls">
          <button type="button" className="btn ghost icon" aria-label="Step zoom window left" title="Step left" onClick={advanceLeft}>
            <ArrowLeft {...I} />
          </button>
          <button type="button" className="btn ghost icon" aria-label="Step zoom window right" title="Step right" onClick={advanceRight}>
            <ArrowRight {...I} />
          </button>
          <button type="button" className="btn ghost" aria-label="Next line in zoom window" title="Wrap to next line" onClick={newLine}>
            <CornerDownLeft {...I} />Next line
          </button>
          <button type="button" className="btn ghost icon" aria-label="Close zoom window" onClick={onClose}>
            <X {...I} />
          </button>
        </div>
      </header>
      <div
        ref={padWrapRef}
        className="zoom-box-pad"
        style={{ height: padH }}
        onPointerMove={(e) => {
          if (e.buttons === 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX - r.left >= r.width * 0.78) enteredAdvanceZone.current = true;
        }}
        onPointerUp={() => {
          if (enteredAdvanceZone.current) {
            enteredAdvanceZone.current = false;
            setTimeout(advanceRight, 140);
          }
        }}>
        <canvas ref={bgRef} style={{ position: "absolute", inset: 0, width: padW, height: padH, pointerEvents: "none" }} />
        <div className="zoom-advance-zone" aria-hidden>
          <span>Auto-advance →</span>
        </div>
        <InkLayer
          pageId={page.id}
          width={padW}
          height={padH}
          paper={notebook.paper}
          layers={page.kind === "ink" ? page.layers : undefined}
          tapeEnabled
          view={{ x: boxPos.x, y: boxPos.y, zoom }}
        />
      </div>
    </section>
  );
}
