/** Spaced repetition (a simplified SM-2, like Anki's): intervals in days, ease >= 1.3. */
export type Grade = "again" | "hard" | "good" | "easy";
export interface Srs {
  state: "new" | "learning" | "review";
  /** days */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  /** ms timestamp */
  due: number;
}

export const MIN = 60_000;
export const DAY = 86_400_000;
const MIN_EASE = 1.3;
export const MASTERED_DAYS = 21;

export const newSrs = (now: number): Srs => ({ state: "new", interval: 0, ease: 2.5, reps: 0, lapses: 0, due: now });

export function review(s: Srs, g: Grade, now: number): Srs {
  const ease = (d: number) => Math.max(MIN_EASE, Math.round((s.ease + d) * 100) / 100);
  if (g === "again") {
    return { ...s, state: "learning", interval: 0, reps: 0, lapses: s.state === "review" ? s.lapses + 1 : s.lapses,
      ease: s.state === "review" ? ease(-0.2) : s.ease, due: now + MIN };
  }
  if (s.state !== "review") {
    if (g === "hard") return { ...s, state: "learning", reps: s.reps + 1, due: now + 10 * MIN };
    const interval = g === "easy" ? 4 : 1;
    return { ...s, state: "review", interval, reps: s.reps + 1, ease: g === "easy" ? ease(0.15) : s.ease, due: now + interval * DAY };
  }
  const base = Math.max(1, s.interval);
  const interval = g === "hard" ? Math.max(base, Math.round(base * 1.2))
    : g === "good" ? Math.max(base + 1, Math.round(base * s.ease))
    : Math.max(base + 2, Math.round(base * s.ease * 1.3));
  const e = g === "hard" ? ease(-0.15) : g === "easy" ? ease(0.15) : s.ease;
  return { ...s, interval, ease: e, reps: s.reps + 1, due: now + interval * DAY };
}

export const isDue = (s: Srs, now: number): boolean => s.due <= now;

export function progressOf(list: Srs[]): { new: number; learning: number; mastered: number } {
  const out = { new: 0, learning: 0, mastered: 0 };
  for (const s of list) {
    if (s.state === "new") out.new++;
    else if (s.state === "review" && s.interval >= MASTERED_DAYS) out.mastered++;
    else out.learning++;
  }
  return out;
}

/** Human label for when a grade would bring the card back ("1 min", "10 min", "3 d"). */
export function nextLabel(s: Srs, g: Grade, now: number): string {
  const ms = review(s, g, now).due - now;
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  const d = Math.round(ms / DAY);
  return d >= 30 ? `${Math.round(d / 30)} mo` : `${d} d`;
}
