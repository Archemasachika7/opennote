"use client";
import { useId, useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { getStroke } from "perfect-freehand";

type Pt = [number, number];
type Variant = "underline" | "arrow" | "tick";

/** Samples a cubic Bézier into points, so a stroke has the uneven spacing of a real pen. */
function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** perfect-freehand outline → closed SVG path (the helper from the library's README). */
function outlinePath(points: number[][]): string {
  if (!points.length) return "";
  const d: (string | number)[] = ["M", points[0][0], points[0][1], "Q"];
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  d.push("Z");
  return d.join(" ");
}

const centreLine = (pts: Pt[]) => "M " + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");

/** Hand-made strokes, in their own viewBox. Each inner array is one pen stroke, drawn in order. */
const SHAPES: Record<Variant, { box: [number, number]; size: number; strokes: Pt[][] }> = {
  underline: {
    box: [200, 24],
    size: 9,
    strokes: [bez([4, 15], [60, 7], [130, 19], [196, 9])],
  },
  tick: {
    box: [24, 20],
    size: 3.4,
    // one stroke: short dip down, then the long flick up to the right
    strokes: [[...bez([3, 10], [5, 12], [7, 15], [9, 17], 8), ...bez([9, 17], [13, 11], [17, 7], [21, 3], 12).slice(1)]],
  },
  arrow: {
    box: [64, 40],
    size: 3.2,
    strokes: [bez([60, 6], [44, 4], [20, 12], [8, 30], 20), bez([4, 18], [6, 23], [7, 27], [8, 31], 8), bez([8, 31], [13, 30], [18, 29], [22, 27], 8)],
  },
};

const BUILT = Object.fromEntries(
  (Object.keys(SHAPES) as Variant[]).map((v) => {
    const s = SHAPES[v];
    return [v, s.strokes.map((pts) => ({
      fill: outlinePath(getStroke(pts, { size: s.size, thinning: 0.55, smoothing: 0.6, streamline: 0.4, simulatePressure: true, last: true })),
      centre: centreLine(pts),
    }))];
  }),
) as Record<Variant, { fill: string; centre: string }[]>;

/**
 * A pen mark that writes itself in when it scrolls into view: the real ink outline (perfect-freehand,
 * the same library the notebook uses) revealed by a mask that follows the stroke's centre line.
 * Reduced motion: the mark is simply there.
 */
export function InkMark({ variant, className, delay = 0, duration = 0.6, tilt = 0 }: {
  variant: Variant; className?: string; delay?: number; duration?: number;
  /** degrees; repeated marks (ticks) look hand-made when no two sit at the same angle */
  tilt?: number;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion() ?? false;
  const id = useId().replace(/:/g, "");
  const { box, size } = SHAPES[variant];
  const parts = BUILT[variant];
  const each = duration / parts.length;

  return (
    <svg ref={ref} className={className} viewBox={`0 0 ${box[0]} ${box[1]}`} preserveAspectRatio="none" aria-hidden focusable="false"
      style={tilt ? { rotate: `${tilt}deg` } : undefined}>
      <defs>
        {parts.map((p, i) => (
          <mask id={`${id}-${i}`} key={i} maskUnits="userSpaceOnUse" x="0" y="0" width={box[0]} height={box[1]}>
            <motion.path d={p.centre} fill="none" stroke="#fff" strokeWidth={size * 2.4} strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={inView || reduce ? { pathLength: 1, opacity: 1 } : undefined}
              transition={{
                pathLength: { delay: delay + i * each, duration: each, ease: "easeInOut" },
                opacity: { delay: delay + i * each, duration: 0.01 },
              }} />
          </mask>
        ))}
      </defs>
      {parts.map((p, i) => (
        <path key={i} d={p.fill} fill="currentColor" mask={`url(#${id}-${i})`} />
      ))}
    </svg>
  );
}
