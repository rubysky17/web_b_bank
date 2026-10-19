/**
 * Study activity derived from attempt start dates (local calendar days): the day streak and the
 * weekly heatmap of the home and report screens. Pure, so it is tested without React.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar day, `2026-10-18`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Attempts per local day. */
export function countByDay(isoDates: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const iso of isoDates) {
    const key = dayKey(new Date(iso));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Consecutive days with at least one attempt, ending today. A streak that ended yesterday still
 * counts (today is not over yet).
 */
export function currentStreak(counts: ReadonlyMap<string, number>, today: Date): number {
  let day = counts.has(dayKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (counts.has(dayKey(day))) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export type HeatCell = {
  key: string;
  count: number;
  /** 0 = nothing, 1–3 = more attempts that day. */
  level: 0 | 1 | 2 | 3;
  isFuture: boolean;
};

const level = (count: number): HeatCell['level'] =>
  count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;

/** `weeks` rows of 7 days (Monday first), the last row being the current week. */
export function heatmapWeeks(
  counts: ReadonlyMap<string, number>,
  today: Date,
  weeks = 5,
): HeatCell[][] {
  // getDay(): 0 = Sunday → Monday-based index.
  const weekday = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -weekday - (weeks - 1) * 7);
  const todayStart = addDays(today, 0).getTime();

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(firstMonday, w * 7 + d);
      const key = dayKey(date);
      const count = counts.get(key) ?? 0;
      return { key, count, level: level(count), isFuture: date.getTime() - todayStart >= DAY_MS };
    }),
  );
}

/**
 * Questions answered today, for the daily goal: attempts started today (server list), with the
 * device's own count when it is ahead (sectioned attempts not uploaded yet).
 */
export function answeredToday(
  attempts: readonly { id: string; startedAt: string; answeredCount: number }[],
  local: readonly { attemptId: string; answeredCount: number }[],
  today: Date,
): number {
  const key = dayKey(today);
  const byId = new Map<string, number>();
  for (const attempt of attempts) {
    if (dayKey(new Date(attempt.startedAt)) === key) byId.set(attempt.id, attempt.answeredCount);
  }
  for (const summary of local) {
    const known = byId.get(summary.attemptId);
    if (known !== undefined) byId.set(summary.attemptId, Math.max(known, summary.answeredCount));
  }
  return [...byId.values()].reduce((sum, count) => sum + count, 0);
}
