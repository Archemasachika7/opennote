"use client";
import { useReducedMotion, type Transition } from "motion/react";

/** Single source of motion values (motion-foundations). Components never inline numbers. */
export const motionTokens = {
  duration: { instant: 0.08, fast: 0.18, normal: 0.35, slow: 0.6, crawl: 1.0 },
  easing: {
    smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
    sharp: [0.4, 0, 0.2, 1] as [number, number, number, number],
  },
  distance: { xs: 4, sm: 8, md: 16, lg: 24, xl: 48 },
  scale: { subtle: 0.98, press: 0.95, pop: 1.04 },
  stagger: 0.06,
} as const;

export const springs = {
  snappy: { type: "spring", stiffness: 300, damping: 30 },
  gentle: { type: "spring", stiffness: 120, damping: 14 },
  instant: { type: "spring", stiffness: 600, damping: 35 },
  release: { type: "spring", stiffness: 200, damping: 20, restDelta: 0.001 },
} satisfies Record<string, Transition>;

/** Enter/exit states that drop all movement when the user prefers reduced motion (opacity only, fast). */
export function useSafeMotion(distance: number = motionTokens.distance.sm) {
  const reduce = useReducedMotion() ?? false;
  return {
    reduce,
    initial: { opacity: 0, y: reduce ? 0 : distance },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduce ? 0 : -distance },
    transition: reduce ? { duration: motionTokens.duration.fast } : springs.snappy,
  };
}
