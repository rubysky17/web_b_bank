/** History list: filtering, outcome per attempt and the "this week / earlier" groups (pure). */
import type { AttemptListItem } from '@/api/attempts';

import type { RowOutcome } from './index';

export const HISTORY_FILTERS = ['all', 'passed', 'failed', 'inProgress'] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

type Outcome = Pick<AttemptListItem, 'status' | 'passed'>;

export function rowOutcome({ status, passed }: Outcome): RowOutcome {
  if (status === 'IN_PROGRESS') return 'progress';
  if (status === 'EXPIRED' || status === 'ABANDONED') return passed === true ? 'passed' : 'ended';
  return passed === null ? 'neutral' : passed ? 'passed' : 'failed';
}

const MATCHES: Record<HistoryFilter, (outcome: RowOutcome) => boolean> = {
  all: () => true,
  passed: (o) => o === 'passed',
  failed: (o) => o === 'failed' || o === 'ended',
  inProgress: (o) => o === 'progress',
};

export type HistoryRow =
  | { kind: 'heading'; key: string; group: 'thisWeek' | 'earlier' }
  | { kind: 'attempt'; key: string; attempt: AttemptListItem; outcome: RowOutcome };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Newest first (as the API sends them), with a heading before each non-empty group. */
export function historyRows(
  attempts: readonly AttemptListItem[],
  filter: HistoryFilter,
  now: number,
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let group: 'thisWeek' | 'earlier' | null = null;
  for (const attempt of attempts) {
    const outcome = rowOutcome(attempt);
    if (!MATCHES[filter](outcome)) continue;
    const next = now - new Date(attempt.startedAt).getTime() < WEEK_MS ? 'thisWeek' : 'earlier';
    if (next !== group) {
      group = next;
      rows.push({ kind: 'heading', key: `h-${next}`, group: next });
    }
    rows.push({ kind: 'attempt', key: attempt.id, attempt, outcome });
  }
  return rows;
}
