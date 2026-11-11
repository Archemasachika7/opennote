import { useGateStats } from "../ink/palmGate";

/**
 * Dev overlay (?debug=palm): what the palm gate decided, live. For tuning on a real tablet: rest a palm,
 * hover the pen, write, and watch which counter moves. Combine with ?debug=latency for latency.
 */
export function PalmOverlay() {
  const s = useGateStats();
  return (
    <div className="mono" role="status" aria-label="Palm rejection diagnostics"
      style={{ position: "fixed", left: 12, bottom: 12, zIndex: 70, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.55,
        background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 6, minWidth: 220 }}>
      <div>pen strokes {s.pen}</div>
      <div>finger writes {s.touchWrite} · scrolls {s.touchNavigate}</div>
      <div>palm by size {s.palmBySize} · near pen {s.palmByPen}</div>
      <div>whole hand {s.palmByCluster} · hand landed {s.palmByTiming}</div>
      <div>cancelled lines {s.cancelled}</div>
      <div className="dim">{s.last || "touch the page"}</div>
    </div>
  );
}
