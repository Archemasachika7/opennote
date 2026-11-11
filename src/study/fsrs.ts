import { dateChrono, defineScheduler, Rating } from "ts-fsrs";
import { schedulerDesiredRetentionMiddleware } from "ts-fsrs/middlewares";
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from "ts-fsrs/models/fsrs-6";
import { DAY, MIN, type Grade, type Srs } from "./srs";

/**
 * FSRS-6 spaced repetition, using the maintained open-source scheduler (ts-fsrs, MIT) for the memory
 * model: Difficulty D in [1..10], Stability S in days, Retrievability R in [0..1]. The short learning
 * steps (minutes) stay ours, and the state is stored alongside `Srs` so SM-2 decks keep working.
 */
export interface FsrsMemory {
  stability: number;
  difficulty: number;
  lastReview: number;
}

export type SrsWithFsrs = Srs & { fsrs?: FsrsMemory };

const makeScheduler = (desiredRetention: number) =>
  defineScheduler({ model: FSRS6Model, chrono: dateChrono })
    .use(schedulerDesiredRetentionMiddleware)
    .create({ config: { weights: [...FSRS6_DEFAULT_WEIGHTS], enableShortTerm: false, numRelearningSteps: 0, desiredRetention, fractionalDays: false } });
type Scheduler = ReturnType<typeof makeScheduler>;

const schedulers = new Map<number, Scheduler>();
function schedulerFor(retention: number): Scheduler {
  const r = Math.round(Math.min(0.97, Math.max(0.7, retention)) * 100) / 100;
  let s = schedulers.get(r);
  if (!s) { s = makeScheduler(r); schedulers.set(r, s); }
  return s;
}

const RATING: Record<Grade, 1 | 2 | 3 | 4> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Predicted probability of recall `R` after `elapsedDays` given stability `S`. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0 || elapsedDays <= 0) return 1;
  return schedulerFor(0.9).model.forgettingCurve({ stability, difficulty: 5 }, elapsedDays);
}

type Card = ReturnType<Scheduler["newCard"]>;

/** The scheduler's card for our stored state: new, migrated from SM-2, or resumed from FSRS memory. */
function cardOf(sch: Scheduler, s: SrsWithFsrs, now: number): Card {
  const fresh = sch.newCard({ now: new Date(now) });
  const prev = s.fsrs;
  if (prev && s.state !== "new") {
    return { ...fresh, stability: prev.stability, difficulty: prev.difficulty, state: 2, scheduleStatus: "review",
      dueAt: new Date(s.due), lastReviewAt: new Date(prev.lastReview) } as Card;
  }
  if (!prev && s.state === "review" && s.interval > 0) {
    // an SM-2 card switching to FSRS: treat its interval as the stability it has shown so far
    return { ...fresh, stability: s.interval, difficulty: 5, state: 2, scheduleStatus: "review",
      dueAt: new Date(s.due), lastReviewAt: new Date(s.due - s.interval * DAY) } as Card;
  }
  return fresh;
}

/** Schedule next review using FSRS-6 while keeping `Srs` fields valid for progress bars & due queues. */
export function reviewFsrs(s: SrsWithFsrs, g: Grade, now: number, desiredRetention = 0.9): SrsWithFsrs {
  const sch = schedulerFor(desiredRetention);
  const next = sch.review({ card: cardOf(sch, s, now), grade: RATING[g], now: new Date(now) }).card;
  const fsrs: FsrsMemory = { stability: round2(next.stability), difficulty: round2(next.difficulty), lastReview: now };

  if (g === "again") {
    const first = !s.fsrs || s.state === "new";
    return { ...s, state: "learning", interval: 0, reps: 0, lapses: s.state === "review" ? s.lapses + 1 : s.lapses,
      due: now + (first ? 1 : 5) * MIN, fsrs };
  }
  if (g === "hard" && s.state === "new") {
    return { ...s, state: "learning", interval: 0, reps: s.reps + 1, due: now + 8 * MIN, fsrs };
  }
  const interval = Math.max(1, Math.round((+next.dueAt - now) / DAY));
  return { ...s, state: "review", interval, reps: s.reps + 1, due: now + interval * DAY, fsrs };
}

export function nextLabelFsrs(s: SrsWithFsrs, g: Grade, now: number, desiredRetention = 0.9): string {
  const ms = reviewFsrs(s, g, now, desiredRetention).due - now;
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  const d = Math.round(ms / DAY);
  if (d >= 365) return `${(d / 365).toFixed(1)} yr`;
  return d >= 30 ? `${Math.round(d / 30)} mo` : `${d} d`;
}
