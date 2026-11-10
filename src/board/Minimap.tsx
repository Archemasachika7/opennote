import { useEffect, useMemo, useRef } from "react";
import type { PageObject, Paper } from "../store/schema";
import { useLive } from "../store/useLive";
import { getStrokes } from "../store/strokes";
import { getObjects } from "../ink/objects";
import { paintStroke, strokePath } from "../ink/render";
import { hiddenLayers, layerOf, type Layer } from "../ink/layers";
import type { Stroke } from "../ink/model";
import type { Box } from "../ink/geometry";
import { contentBounds, minimapFit, unionBox, viewBox, type View } from "./viewport";

export const MINI_W = 200;
export const MINI_H = 136;

/** Grow a box outwards to grid lines of half its size (at least 600 units), with a margin. */
export function snapOut(b: Box): Box {
  const s = Math.max(b.w, b.h, 1200) / 2;
  const x0 = Math.floor(b.x / s) * s, y0 = Math.floor(b.y / s) * s;
  const x1 = Math.ceil((b.x + b.w) / s) * s, y1 = Math.ceil((b.y + b.h) / s) * s;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Overview of the whole board with the visible area marked; click or drag to jump there. */
export function Minimap({ pageId, paper, view, size, layers, onView }: {
  pageId: string; paper: Paper; view: View; size: { w: number; h: number }; layers?: Layer[]; onView: (v: View) => void;
}) {
  const strokes = useLive(() => getStrokes(pageId), [pageId], [] as Stroke[]);
  const objects = useLive(() => getObjects(pageId), [pageId], [] as PageObject[]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const paths = useRef(new Map<string, Path2D>());
  const shown = useMemo(() => {
    const hidden = hiddenLayers({ layers });
    return strokes.filter((s) => !hidden.has(layerOf(s)));
  }, [strokes, layers]);
  const vb = viewBox(view, size.w, size.h);
  const content = useMemo(() => contentBounds(shown, objects), [shown, objects]);
  // The overview area snaps to a coarse grid, so panning/zooming only changes it (and repaints every
  // stroke) when the view crosses a grid line, not on every frame.
  const world = snapOut(content ? unionBox(content, vb) : vb);
  const fit = minimapFit(world, MINI_W, MINI_H);

  useEffect(() => {
    const ids = new Set(strokes.map((s) => s.id));
    for (const id of paths.current.keys()) if (!ids.has(id)) paths.current.delete(id);
  }, [strokes]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = MINI_W * dpr; c.height = MINI_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MINI_W, MINI_H);
    ctx.setTransform(dpr * fit.k, 0, 0, dpr * fit.k, dpr * fit.ox, dpr * fit.oy);
    ctx.fillStyle = paper === "dark" ? "rgba(232,233,238,0.18)" : "rgba(22,23,28,0.14)";
    for (const o of objects) ctx.fillRect(o.x, o.y, o.w, o.h);
    for (const s of shown) {
      let p = paths.current.get(s.id);
      if (!p) { p = strokePath(s); paths.current.set(s.id, p); }
      paintStroke(ctx, s, paper, p);
    }
  }, [shown, objects, fit.k, fit.ox, fit.oy, paper]);

  const jump = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const lx = (e.clientX - r.left - fit.ox) / fit.k;
    const ly = (e.clientY - r.top - fit.oy) / fit.k;
    onView({ ...view, x: lx - vb.w / 2, y: ly - vb.h / 2 });
  };

  return (
    <div className="minimap" data-testid="minimap" role="group" aria-label="Board overview. Click to move there; the Fit button shows everything."
      style={{ width: MINI_W, height: MINI_H }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); jump(e); }}
      onPointerMove={(e) => { if (e.buttons) jump(e); }}>
      <canvas ref={canvas} style={{ width: MINI_W, height: MINI_H }} />
      <span className="minimap-view" style={{
        left: vb.x * fit.k + fit.ox, top: vb.y * fit.k + fit.oy, width: Math.max(4, vb.w * fit.k), height: Math.max(4, vb.h * fit.k),
      }} />
    </div>
  );
}
