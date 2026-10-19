import type { AttemptListItem } from '@/api/attempts';

import { historyRows, rowOutcome } from './rows';

const NOW = new Date(2026, 9, 18, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

const attempt = (
  id: string,
  daysAgo: number,
  patch: Partial<AttemptListItem> = {},
): AttemptListItem =>
  ({
    id,
    examId: 'e1',
    examTitle: 'Exam',
    status: 'SUBMITTED',
    passed: true,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    ...patch,
  }) as AttemptListItem;

describe('rowOutcome', () => {
  it('maps status and pass flag', () => {
    expect(rowOutcome({ status: 'IN_PROGRESS', passed: null })).toBe('progress');
    expect(rowOutcome({ status: 'SUBMITTED', passed: true })).toBe('passed');
    expect(rowOutcome({ status: 'SUBMITTED', passed: false })).toBe('failed');
    expect(rowOutcome({ status: 'SUBMITTED', passed: null })).toBe('neutral');
    expect(rowOutcome({ status: 'EXPIRED', passed: false })).toBe('ended');
    expect(rowOutcome({ status: 'ABANDONED', passed: null })).toBe('ended');
  });
});

describe('historyRows', () => {
  const list = [
    attempt('a', 0, { status: 'IN_PROGRESS', passed: null }),
    attempt('b', 2),
    attempt('c', 9, { passed: false }),
    attempt('d', 20),
  ];

  it('groups this week and earlier', () => {
    expect(historyRows(list, 'all', NOW).map((r) => r.key)).toEqual([
      'h-thisWeek',
      'a',
      'b',
      'h-earlier',
      'c',
      'd',
    ]);
  });

  it('filters and drops empty groups', () => {
    expect(historyRows(list, 'failed', NOW).map((r) => r.key)).toEqual(['h-earlier', 'c']);
    expect(historyRows(list, 'inProgress', NOW).map((r) => r.key)).toEqual(['h-thisWeek', 'a']);
  });
});
