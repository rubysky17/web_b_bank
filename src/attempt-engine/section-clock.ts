/**
 * The section clock: active time only. `now` must come from a monotonic source (`performance.now()`),
 * never from `Date.now()`, so a device clock change cannot add or remove time. The reading is always
 * computed from `usedMs + (now - runningSince)`, never decremented per tick, so it cannot drift.
 */
export type SectionClock = {
  budgetMs: number;
  /** Time banked so far (pauses excluded). */
  usedMs: number;
  /** Monotonic time the current run began; null while paused. */
  runningSince: number | null;
};

export const createClock = (budgetMs: number, usedMs = 0): SectionClock => ({
  budgetMs,
  usedMs: Math.min(Math.max(0, usedMs), budgetMs),
  runningSince: null,
});

/** Active time used, never above the budget. A monotonic source never goes back; guard anyway. */
export function readClock(clock: SectionClock, now: number): number {
  const running = clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince);
  return Math.min(clock.usedMs + running, clock.budgetMs);
}

export const remainingMs = (clock: SectionClock, now: number) =>
  clock.budgetMs - readClock(clock, now);

export const isRunning = (clock: SectionClock) => clock.runningSince !== null;

export const resumeClock = (clock: SectionClock, now: number): SectionClock =>
  clock.runningSince === null && clock.usedMs < clock.budgetMs
    ? { ...clock, runningSince: now }
    : clock;

/** Moves the running stretch into `usedMs` and keeps running (used for checkpoints). */
export const bankClock = (clock: SectionClock, now: number): SectionClock =>
  clock.runningSince === null
    ? clock
    : { ...clock, usedMs: readClock(clock, now), runningSince: now };

export const pauseClock = (clock: SectionClock, now: number): SectionClock => ({
  ...clock,
  usedMs: readClock(clock, now),
  runningSince: null,
});
