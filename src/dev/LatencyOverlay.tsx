import { useEffect, useState } from "react";

/** Dev overlay (?debug=latency): rolling p50/p95 of input-event-to-frame latency. */
export function LatencyOverlay() {
  const [stats, setStats] = useState<{ p50: number; p95: number } | null>(null);
  useEffect(() => {
    const samples: number[] = [];
    const onMove = (e: PointerEvent) => {
      requestAnimationFrame(() => {
        samples.push(performance.now() - e.timeStamp);
        if (samples.length > 120) samples.shift();
        if (samples.length % 10 === 0) {
          const s = [...samples].sort((a, b) => a - b);
          setStats({ p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)] });
        }
      });
    };
    document.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => document.removeEventListener("pointermove", onMove, { capture: true });
  }, []);
  return (
    <div className="mono" style={{ position: "fixed", right: 12, bottom: 12, zIndex: 70, padding: "6px 10px", fontSize: 12,
      background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 6 }}>
      ink latency p50 {stats ? stats.p50.toFixed(1) : "-"} ms / p95 {stats ? stats.p95.toFixed(1) : "-"} ms
    </div>
  );
}
