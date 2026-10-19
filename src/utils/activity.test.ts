import { answeredToday, countByDay, currentStreak, dayKey, heatmapWeeks } from './activity';

// Local dates, so the tests don't depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

describe('countByDay', () => {
  it('groups attempts by local day', () => {
    const counts = countByDay([at(2026, 10, 18, 9), at(2026, 10, 18, 21), at(2026, 10, 17)]);
    expect(counts.get('2026-10-18')).toBe(2);
    expect(counts.get('2026-10-17')).toBe(1);
  });
});

describe('currentStreak', () => {
  const today = new Date(2026, 9, 18, 15);

  it('counts consecutive days ending today', () => {
    const counts = countByDay([
      at(2026, 10, 18),
      at(2026, 10, 17),
      at(2026, 10, 16),
      at(2026, 10, 14),
    ]);
    expect(currentStreak(counts, today)).toBe(3);
  });

  it('keeps a streak that ended yesterday', () => {
    const counts = countByDay([at(2026, 10, 17), at(2026, 10, 16)]);
    expect(currentStreak(counts, today)).toBe(2);
  });

  it('is 0 without an attempt today or yesterday', () => {
    expect(currentStreak(countByDay([at(2026, 10, 15)]), today)).toBe(0);
    expect(currentStreak(new Map(), today)).toBe(0);
  });
});

describe('heatmapWeeks', () => {
  // Sunday 18 Oct 2026: the last row runs Mon 12 → Sun 18.
  const today = new Date(2026, 9, 18, 15);

  it('builds Monday-first weeks ending with the current week', () => {
    const weeks = heatmapWeeks(new Map(), today, 5);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[4]![0]!.key).toBe('2026-10-12');
    expect(weeks[4]![6]!.key).toBe(dayKey(today));
    expect(weeks[0]![0]!.key).toBe('2026-09-14');
  });

  it('marks levels and future days', () => {
    const counts = countByDay([at(2026, 10, 13), at(2026, 10, 13), at(2026, 10, 14)]);
    const wednesday = new Date(2026, 9, 14, 12);
    const [week] = heatmapWeeks(counts, wednesday, 1);
    expect(week!.map((cell) => cell.level)).toEqual([0, 2, 1, 0, 0, 0, 0]);
    expect(week!.map((cell) => cell.isFuture)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('answeredToday', () => {
  const today = new Date(2026, 9, 18, 15);

  it('sums attempts started today, preferring the device count when ahead', () => {
    const attempts = [
      { id: 'a', startedAt: at(2026, 10, 18, 9), answeredCount: 12 },
      { id: 'b', startedAt: at(2026, 10, 18, 11), answeredCount: 5 },
      { id: 'c', startedAt: at(2026, 10, 17), answeredCount: 40 },
    ];
    const local = [
      { attemptId: 'b', answeredCount: 9 },
      { attemptId: 'z', answeredCount: 99 },
    ];
    expect(answeredToday(attempts, local, today)).toBe(21);
    expect(answeredToday([], [], today)).toBe(0);
  });
});
