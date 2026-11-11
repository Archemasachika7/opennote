import { useEffect, useRef, useState } from "react";
import type { Paper } from "../store/schema";
import { getStrokes } from "../store/strokes";
import { paintStroke } from "../ink/render";
import { hiddenLayers, layerOf, type Layer } from "../ink/layers";
import { useBlobUrl } from "../ui/useBlobUrl";

/** Wait this long after the last change before re-drawing, so a thumbnail updates once per pause, not per point. */
const SETTLE_MS = 220;

/**
 * A live miniature of an ink page: the real strokes, drawn small. It redraws when `version` changes
 * (the page's updatedAt moves on every saved stroke, paste, erase or sync pull) and only while visible
 * in the sidebar, so a long notebook doesn't paint hundreds of hidden thumbnails.
 */
export function PageThumbCanvas({ pageId, version, logicalW, logicalH, paper, layers, backgroundBlobId }: {
  pageId: string; version: number; logicalW: number; logicalH: number; paper: Paper; layers?: Layer[]; backgroundBlobId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const bg = useBlobUrl(backgroundBlobId);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "200px 0px" });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void getStrokes(pageId).then((list) => {
        const c = ref.current;
        if (!alive || !c) return;
        const cssW = c.clientWidth || 140;
        const cssH = c.clientHeight || (cssW * logicalH) / logicalW;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.max(1, Math.round(cssW * dpr));
        c.height = Math.max(1, Math.round(cssH * dpr));
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        const k = (cssW * dpr) / logicalW;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        const hidden = hiddenLayers({ layers });
        const shown = list.filter((s) => !hidden.has(layerOf(s)));
        for (const s of shown) if (s.tool === "highlighter") paintStroke(ctx, s, paper);
        for (const s of shown) if (s.tool !== "highlighter") paintStroke(ctx, s, paper);
      });
    }, SETTLE_MS);
    return () => { alive = false; window.clearTimeout(t); };
  }, [visible, pageId, version, logicalW, logicalH, paper, layers]);

  return (
    <>
      {bg && <img className="thumb-bg" src={bg} alt="" draggable={false} aria-hidden />}
      <canvas ref={ref} className="thumb-ink" data-testid="thumb-ink" aria-hidden />
    </>
  );
}
