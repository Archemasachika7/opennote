import { useEffect, useMemo, useState, type RefObject } from "react";

/** Tracks which page elements ([data-page-index]) intersect the viewport; mounts visible +-1. */
export function useVisiblePages(container: RefObject<HTMLElement | null>, count: number): { mounted: Set<number>; current: number } {
  const [ratios, setRatios] = useState<Map<number, number>>(() => new Map());

  useEffect(() => {
    const root = container.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      setRatios((prev) => {
        const next = new Map(prev);
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(i)) continue;
          if (e.isIntersecting) next.set(i, e.intersectionRatio); else next.delete(i);
        }
        return next;
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    root.querySelectorAll<HTMLElement>("[data-page-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [container, count]);

  return useMemo(() => {
    const visible = [...ratios.keys()].filter((i) => i < count);
    let current = 0;
    let best = -1;
    for (const [i, r] of ratios) if (i < count && r > best) { best = r; current = i; }
    const mounted = new Set<number>();
    for (const i of visible) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < count) mounted.add(j);
    if (mounted.size === 0 && count > 0) { mounted.add(0); if (count > 1) mounted.add(1); }
    return { mounted, current };
  }, [ratios, count]);
}
