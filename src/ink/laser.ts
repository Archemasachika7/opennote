/** Laser pointer: a temporary trail that is never saved and never part of undo. */
export const LASER_FADE_MS = 1000;
/** Neon red, like a real presenter's laser: a hot core with a red glow around it. */
export const LASER_COLOR = "#FF1F3D";
const LASER_CORE = "#FFE3E7";

/** `start` marks the first point of a new trail (no line joins it to the previous one). */
export type LaserPoint = { x: number; y: number; t: number; start?: boolean };

/** Opacity of a point drawn at `t` when it is now `now` (1 → 0 over the fade time). */
export function laserAlpha(t: number, now: number): number {
  const age = now - t;
  if (age <= 0) return 1;
  if (age >= LASER_FADE_MS) return 0;
  return 1 - age / LASER_FADE_MS;
}

/** Points that are still visible. */
export function liveLaserPoints(pts: LaserPoint[], now: number): LaserPoint[] {
  return pts.filter((p) => laserAlpha(p.t, now) > 0);
}

/** Paint the trail as short segments, each faded by its age. `unit` is one screen px in canvas units. */
export function paintLaser(ctx: CanvasRenderingContext2D, pts: LaserPoint[], now: number, unit: number): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = LASER_COLOR;
  ctx.shadowColor = LASER_COLOR;
  ctx.shadowBlur = 16 * unit;
  ctx.lineWidth = 6 * unit;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].start) continue;
    ctx.globalAlpha = laserAlpha(pts[i].t, now);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  // a thin bright core along the trail, so it reads as light rather than paint
  ctx.shadowBlur = 0;
  ctx.strokeStyle = LASER_CORE;
  ctx.lineWidth = 1.6 * unit;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].start) continue;
    ctx.globalAlpha = laserAlpha(pts[i].t, now) * 0.9;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  const last = pts[pts.length - 1];
  ctx.globalAlpha = laserAlpha(last.t, now);
  ctx.shadowColor = LASER_COLOR;
  ctx.shadowBlur = 22 * unit;
  ctx.fillStyle = LASER_COLOR;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6 * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = LASER_CORE;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.4 * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
