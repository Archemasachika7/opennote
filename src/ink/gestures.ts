import { STRIDE } from "./model";
import { bbox } from "./geometry";

/**
 * Detect a deliberate scribble-to-erase pen gesture:
 * - At least 4 sharp direction reversals (> 135 deg)
 * - Path doubles back repeatedly across a compact bounding box (pathLen >= 2.8 * diagonal)
 * - Diagonal >= 18 logical px (not a dot/period)
 * Normal cursive handwriting ("minimum", "www") advances steadily along one axis so its
 * pathLen/diagonal ratio stays ~1.3..2.2 and does not make >= 4 sharp 180-degree reversals
 * over top of existing ink.
 */
export function isScribbleGesture(points: Float32Array): boolean {
  const n = Math.floor(points.length / STRIDE);
  if (n < 10) return false;

  // Subsample to >= 6px spacing so stylus micro-jitter cannot fake reversals
  const pts: [number, number][] = [[points[0], points[1]]];
  let totalLen = 0;
  for (let i = 1; i < n; i++) {
    const x = points[i * STRIDE], y = points[i * STRIDE + 1];
    const [px, py] = pts[pts.length - 1];
    const d = Math.hypot(x - px, y - py);
    if (d >= 6) {
      pts.push([x, y]);
      totalLen += d;
    }
  }
  if (pts.length < 6) return false;

  const box = bbox(points);
  const diag = Math.hypot(box.w, box.h);
  if (diag < 18) return false;
  if (totalLen < diag * 2.8) return false;

  // Check endpoints aren't simply closing a neat shape (closed shapes have start ~= end with smooth loop)
  let sharpReversals = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ux = pts[i][0] - pts[i - 1][0], uy = pts[i][1] - pts[i - 1][1];
    const vx = pts[i + 1][0] - pts[i][0], vy = pts[i + 1][1] - pts[i][1];
    const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
    if (ul < 4 || vl < 4) continue;
    const cos = (ux * vx + uy * vy) / (ul * vl);
    // cos < -0.707 means direction turned by > 135 degrees (back-and-forth zig-zag)
    if (cos < -0.7) sharpReversals++;
  }

  return sharpReversals >= 4;
}

/** Extract 2D [x, y, x, y, ...] path from STRIDE-4 Float32Array points. */
export function pointsToXYPath(points: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += STRIDE) out.push(points[i], points[i + 1]);
  return out;
}
