import { DAY, MIN, type Grade, type Srs } from "./srs";

/**
 * Pure TypeScript implementation of the open-source FSRS-4.5 (Free Spaced Repetition Scheduler)
 * DSR memory model (Difficulty D in [1..10], Stability S in days, Retrievability R in [0..1]).
 * Zero external dependencies; stores state non-destructively alongside `Srs`.
 */
export interface FsrsMemory {
  stability: number;
  difficulty: number;
  lastReview: number;
}

export type SrsWithFsrs = Srs & { fsrs?: FsrsMemory };

// Default published FSRS-4.5 17-parameter weights
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, // w0..w3: initial stabilities for Again, Hard, Good, Easy
  5.1618, 1.2298, 0.8975, 0.031,   // w4..w7: initial & subsequent difficulty dynamics
  1.6474, 0.1367, 1.0461,          // w8..w10: recall stability growth
  2.1072, 0.0793, 0.3246, 1.587,   // w11..w14: post-lapse stability
  0.2272, 2.8755,                  // w15..w16: hard penalty & easy bonus
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81; // (0.9^(1/DECAY) - 1) so R(t = S) = 0.9

const RATING: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const clampS = (s: number) => Math.max(0.1, Math.min(36500, s));

/** Predicted probability of recall `R` after `elapsedDays` given stability `S`. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0 || elapsedDays <= 0) return 1;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextIntervalDays(stability: number, desiredRetention: number): number {
  const r = Math.min(0.97, Math.max(0.7, desiredRetention));
  const raw = (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  return Math.max(1, Math.round(raw));
}

function initDifficulty(g: Grade): number {
  const r = RATING[g];
  return clampD(W[4] - (r - 3) * W[5]);
}

function nextDifficulty(d: number, g: Grade): number {
  const r = RATING[g];
  const d0 = initDifficulty("good");
  const next = d - W[6] * (r - 3);
  // Mean reversion toward d0
  return clampD(W[7] * d0 + (1 - W[7]) * next);
}

function nextRecallStability(d: number, s: number, r: number, g: Grade): number {
  const hardPenalty = g === "hard" ? W[15] : 1;
  const easyBonus = g === "easy" ? W[16] : 1;
  const inc =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp((1 - r) * W[10]) - 1) *
    hardPenalty *
    easyBonus;
  return clampS(s * (1 + inc));
}

function nextForgetStability(d: number, s: number, r: number): number {
  return clampS(
    W[11] *
      Math.pow(d, -W[12]) *
      (Math.pow(s + 1, W[13]) - 1) *
      Math.exp((1 - r) * W[14]),
  );
}

/** Schedule next review using FSRS-4.5 while keeping `Srs` fields valid for progress bars & due queues. */
export function reviewFsrs(s: SrsWithFsrs, g: Grade, now: number, desiredRetention = 0.9): SrsWithFsrs {
  const prev = s.fsrs;

  // First-ever review of a card (or migrating an existing SM-2 card into FSRS)
  if (!prev || s.state === "new") {
    const rIdx = RATING[g] - 1;
    const stability = clampS(s.interval > 0 ? s.interval : W[rIdx]);
    const difficulty = initDifficulty(g);
    const fsrs: FsrsMemory = { stability: Math.round(stability * 100) / 100, difficulty: Math.round(difficulty * 100) / 100, lastReview: now };

    if (g === "again") {
      return { ...s, state: "learning", interval: 0, reps: 0, due: now + MIN, fsrs };
    }
    if (g === "hard" && s.state === "new") {
      return { ...s, state: "learning", interval: 0, reps: s.reps + 1, due: now + 8 * MIN, fsrs };
    }
    const interval = nextIntervalDays(stability, desiredRetention);
    return {
      ...s,
      state: "review",
      interval,
      reps: s.reps + 1,
      due: now + interval * DAY,
      fsrs,
    };
  }

  const elapsedDays = Math.max(0, (now - prev.lastReview) / DAY);
  const r = retrievability(prev.stability, elapsedDays);
  const difficulty = nextDifficulty(prev.difficulty, g);

  if (g === "again") {
    const stability = nextForgetStability(difficulty, prev.stability, r);
    return {
      ...s,
      state: "learning",
      interval: 0,
      reps: 0,
      lapses: s.state === "review" ? s.lapses + 1 : s.lapses,
      due: now + 5 * MIN,
      fsrs: { stability: Math.round(stability * 100) / 100, difficulty: Math.round(difficulty * 100) / 100, lastReview: now },
    };
  }

  const stability = s.state === "learning"
    ? clampS(Math.max(prev.stability, W[RATING[g] - 1]))
    : nextRecallStability(difficulty, prev.stability, r, g);
  const interval = nextIntervalDays(stability, desiredRetention);

  return {
    ...s,
    state: "review",
    interval,
    reps: s.reps + 1,
    due: now + interval * DAY,
    fsrs: { stability: Math.round(stability * 100) / 100, difficulty: Math.round(difficulty * 100) / 100, lastReview: now },
  };
}

export function nextLabelFsrs(s: SrsWithFsrs, g: Grade, now: number, desiredRetention = 0.9): string {
  const ms = reviewFsrs(s, g, now, desiredRetention).due - now;
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  const d = Math.round(ms / DAY);
  if (d >= 365) return `${(d / 365).toFixed(1)} yr`;
  return d >= 30 ? `${Math.round(d / 30)} mo` : `${d} d`;
}
