import { STRIDE, type Stroke } from "./model";

export interface StrokeReplayFrame {
  state: "future" | "writing" | "done";
  partial: Stroke | null;
  tip: { x: number; y: number } | null;
}

const INSTANT_REVEAL_MS = 260;

/**
 * Compute progressive Ink Replay state for an audio-synced stroke at `currentMs`.
 * Uses per-point relative timestamps (`points[i * 4 + 3]`) recorded during drawing!
 */
export function sliceStrokeByTime(s: Stroke, currentMs: number): StrokeReplayFrame {
  if (!s.audioSync) return { state: "done", partial: null, tip: null };
  const relMs = currentMs - s.audioSync.offsetMs;
  if (relMs < 0) return { state: "future", partial: null, tip: null };

  const pts = s.points;
  const n = pts.length / STRIDE;
  if (n === 0) return { state: "done", partial: null, tip: null };

  let maxT = 0;
  for (let i = 0; i < n; i++) {
    const t = pts[i * STRIDE + 3];
    if (t > maxT) maxT = t;
  }

  if (maxT >= 40) {
    if (relMs >= maxT) return { state: "done", partial: null, tip: null };
    let keep = 1;
    for (let i = 0; i < n; i++) {
      if (pts[i * STRIDE + 3] <= relMs) keep = i + 1;
      else break;
    }
    const sliced = pts.slice(0, keep * STRIDE);
    const tipX = sliced[(keep - 1) * STRIDE];
    const tipY = sliced[(keep - 1) * STRIDE + 1];
    return {
      state: "writing",
      partial: { ...s, shape: undefined, points: sliced },
      tip: { x: tipX, y: tipY },
    };
  }

  // Geometric shapes or quick dots (all point timestamps ~0): smooth 260ms reveal
  if (relMs >= INSTANT_REVEAL_MS) return { state: "done", partial: null, tip: null };
  const frac = Math.max(0.2, Math.min(1, relMs / INSTANT_REVEAL_MS));
  const keep = Math.max(2, Math.min(n, Math.ceil(n * frac)));
  const sliced = pts.slice(0, keep * STRIDE);
  return {
    state: "writing",
    partial: s.shape ? s : { ...s, points: sliced },
    tip: { x: sliced[(keep - 1) * STRIDE], y: sliced[(keep - 1) * STRIDE + 1] },
  };
}
