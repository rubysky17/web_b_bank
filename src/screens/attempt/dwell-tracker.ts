/**
 * Foreground time spent on each question before it is answered (pure, no React).
 * Time from earlier visits is kept until the question is answered, so leaving a question and coming
 * back to answer it counts both visits. Time while the app is in the background is not counted.
 */

/** Longest time credited to one pick (the server applies the same cap). */
export const MAX_DWELL_MS = 10 * 60_000;

export type DwellState = {
  questionId: string | null;
  /** Start of the current stretch; null while paused (app not in the foreground). */
  runningSince: number | null;
  /** Unsent time per question. */
  pending: Record<string, number>;
};

export const startDwell = (
  questionId: string | null,
  now: number,
  isActive: boolean,
): DwellState => ({ questionId, runningSince: isActive ? now : null, pending: {} });

/** Moves the running stretch into the current question's pending time. */
function bank(state: DwellState, now: number): DwellState {
  if (state.runningSince === null) return state;
  // A clock that jumped backwards counts as no time.
  const elapsed = Math.max(0, now - state.runningSince);
  if (state.questionId === null || elapsed === 0) return { ...state, runningSince: now };
  return {
    ...state,
    runningSince: now,
    pending: {
      ...state.pending,
      [state.questionId]: (state.pending[state.questionId] ?? 0) + elapsed,
    },
  };
}

export function switchQuestion(state: DwellState, questionId: string | null, now: number) {
  if (questionId === state.questionId) return state;
  return { ...bank(state, now), questionId };
}

export const pause = (state: DwellState, now: number): DwellState => ({
  ...bank(state, now),
  runningSince: null,
});

export const resume = (state: DwellState, now: number): DwellState =>
  state.runningSince === null ? { ...state, runningSince: now } : state;

/** Whole ms spent on the current question (earlier visits included, capped), then counts from zero. */
export function take(state: DwellState, now: number): { ms: number; next: DwellState } {
  const banked = bank(state, now);
  if (banked.questionId === null) return { ms: 0, next: banked };
  const { [banked.questionId]: total = 0, ...rest } = banked.pending;
  return {
    ms: Math.min(Math.round(total), MAX_DWELL_MS),
    next: { ...banked, pending: rest },
  };
}
