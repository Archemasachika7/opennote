import { useEffect, useRef, type RefObject } from "react";

/** A point on a page (as a fraction of the page) that must stay under a screen point after a zoom. */
export type ZoomAnchor = { pageIndex: number; fx: number; fy: number; sx: number; sy: number };

const WHEEL_SETTLE_MS = 140;

/** The page under (or nearest to) a screen point, as an anchor. */
export function anchorAt(scroller: HTMLElement, sx: number, sy: number): ZoomAnchor | null {
  const papers = scroller.querySelectorAll<HTMLElement>("[data-page-index]");
  let best: { i: number; r: DOMRect; d: number } | null = null;
  papers.forEach((el) => {
    const paper = el.querySelector<HTMLElement>(".paper") ?? el;
    const r = paper.getBoundingClientRect();
    const d = sy < r.top ? r.top - sy : sy > r.bottom ? sy - r.bottom : 0;
    if (!best || d < best.d) best = { i: Number(el.dataset.pageIndex), r, d };
  });
  if (!best) return null;
  const { i, r } = best as { i: number; r: DOMRect };
  if (!r.width || !r.height) return null;
  return { pageIndex: i, fx: (sx - r.left) / r.width, fy: (sy - r.top) / r.height, sx, sy };
}

/** After the column re-laid out at the new zoom, scroll so the anchored page point is back under the fingers. */
export function restoreAnchor(scroller: HTMLElement, a: ZoomAnchor): void {
  const el = scroller.querySelector<HTMLElement>(`[data-page-index="${a.pageIndex}"]`);
  const paper = el?.querySelector<HTMLElement>(".paper") ?? el;
  if (!paper) return;
  const r = paper.getBoundingClientRect();
  scroller.scrollLeft += r.left + a.fx * r.width - a.sx;
  scroller.scrollTop += r.top + a.fy * r.height - a.sy;
}

/** Zoom factor for one wheel event; trackpad pinches send small deltas, mouse wheels large ones. */
export const wheelFactor = (deltaY: number): number => Math.exp(-Math.max(-40, Math.min(40, deltaY)) * 0.01);

/**
 * Two-finger pinch (touch screens: phones, tablets, touch laptops) and Ctrl/Cmd+wheel / trackpad pinch
 * zoom for the notebook. Works in palm mode too: fingers never write once a pen is seen, but they zoom.
 * While the gesture runs the column is only CSS-transformed (cheap, 60 fps); the real zoom is committed
 * once at the end, then `commit` keeps the point between the fingers in place.
 *
 * `ready` must turn true once the scroller is in the DOM (the view first renders a loading state).
 */
export function usePinchZoom(opts: {
  scroller: RefObject<HTMLElement | null>;
  column: RefObject<HTMLElement | null>;
  ready: boolean;
  getZoom: () => number;
  clamp: (z: number) => number;
  commit: (zoom: number, anchor: ZoomAnchor | null) => void;
}): void {
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    const el = opts.scroller.current;
    if (!opts.ready || !el) return;

    type G = { z0: number; d0: number; mx0: number; my0: number; left: number; top: number; anchor: ZoomAnchor | null; k: number; mx: number; my: number };
    let g: G | null = null;
    let raf = 0;

    const begin = (mx: number, my: number, d0: number): G | null => {
      const col = o.current.column.current;
      if (!col) return null;
      const r = col.getBoundingClientRect();
      col.style.transformOrigin = "0 0";
      col.style.willChange = "transform";
      return { z0: o.current.getZoom(), d0, mx0: mx, my0: my, left: r.left, top: r.top, anchor: anchorAt(el, mx, my), k: 1, mx, my };
    };
    const paint = () => {
      raf = 0;
      const col = o.current.column.current;
      if (!g || !col) return;
      const tx = g.mx - g.left - (g.mx0 - g.left) * g.k;
      const ty = g.my - g.top - (g.my0 - g.top) * g.k;
      col.style.transform = `translate(${tx}px, ${ty}px) scale(${g.k})`;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const end = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const done = g;
      g = null;
      const col = o.current.column.current;
      if (col) { col.style.transform = ""; col.style.willChange = ""; }
      if (!done) return;
      const z = o.current.clamp(done.z0 * done.k);
      const anchor = done.anchor ? { ...done.anchor, sx: done.mx, sy: done.my } : null;
      o.current.commit(z, anchor);
    };
    const update = (mx: number, my: number, scale: number) => {
      if (!g) return;
      // clamp the preview to the zoom limits so the column never shrinks past what will be committed
      g.k = o.current.clamp(g.z0 * scale) / g.z0;
      g.mx = mx; g.my = my;
      schedule();
    };

    // ---- touch: two fingers zoom and pan ----
    const two = (e: TouchEvent) => {
      const a = e.touches[0], b = e.touches[1];
      return { mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
    };
    const tstart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const t = two(e);
      if (g) end();
      g = begin(t.mx, t.my, t.d);
    };
    const tmove = (e: TouchEvent) => {
      if (!g || e.touches.length < 2) return;
      if (e.cancelable) e.preventDefault();
      const t = two(e);
      update(t.mx, t.my, t.d / g.d0);
    };
    const tend = (e: TouchEvent) => { if (g && e.touches.length < 2) end(); };

    // ---- wheel: Ctrl/Cmd + wheel, and trackpad pinch (which browsers report as ctrl+wheel) ----
    let wheelTimer = 0;
    let wheelScale = 1;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!g) { g = begin(e.clientX, e.clientY, 1); wheelScale = 1; }
      if (!g) return;
      wheelScale *= wheelFactor(e.deltaY);
      update(g.mx0, g.my0, wheelScale);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(end, WHEEL_SETTLE_MS);
    };

    el.addEventListener("touchstart", tstart, { passive: false, capture: true });
    el.addEventListener("touchmove", tmove, { passive: false, capture: true });
    el.addEventListener("touchend", tend, { capture: true });
    el.addEventListener("touchcancel", tend, { capture: true });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.clearTimeout(wheelTimer);
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("touchstart", tstart, { capture: true });
      el.removeEventListener("touchmove", tmove, { capture: true });
      el.removeEventListener("touchend", tend, { capture: true });
      el.removeEventListener("touchcancel", tend, { capture: true });
      el.removeEventListener("wheel", wheel);
    };
  }, [opts.ready, opts.scroller]);
}
