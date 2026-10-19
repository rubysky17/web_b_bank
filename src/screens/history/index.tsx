import type { TFunction } from 'i18next';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { type AttemptListItem, useAttempts } from '@/api/attempts';
import { FilterPill, PillRow } from '@/components/app/filter-pill';
import { IconTile, toneFor } from '@/components/app/icon-tile';
import { ProgressRing } from '@/components/app/progress-ring';
import { CenteredSpinner, EmptyView, ErrorView, LoadingView } from '@/components/app/states';
import { Page, PageTitle } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { useLoadMore } from '@/hooks/use-load-more';
import { cn } from '@/lib/utils';

import { HISTORY_FILTERS, type HistoryFilter, historyRows } from './rows';

/** How a row reads at a glance: in progress, passed, not passed, ended early, or no pass mark. */
export type RowOutcome = 'progress' | 'passed' | 'failed' | 'ended' | 'neutral';

// Literal class names so Tailwind generates them.
const PILL = {
  progress: { pill: 'bg-primary-soft text-primary-soft-foreground', dot: 'bg-primary' },
  passed: { pill: 'bg-success-soft text-success-soft-foreground', dot: 'bg-success' },
  failed: { pill: 'bg-destructive-soft text-destructive-soft-foreground', dot: 'bg-destructive' },
  ended: { pill: 'bg-warning-soft text-warning-soft-foreground', dot: 'bg-warning' },
  neutral: { pill: 'bg-secondary text-secondary-foreground', dot: 'bg-muted-foreground' },
} as const satisfies Record<RowOutcome, { pill: string; dot: string }>;

const PERCENT = {
  progress: 'text-primary-soft-foreground',
  passed: 'text-success-soft-foreground',
  failed: 'text-destructive-soft-foreground',
  ended: 'text-warning-soft-foreground',
  neutral: 'text-foreground',
} as const satisfies Record<RowOutcome, string>;

function statusLabel(attempt: AttemptListItem, outcome: RowOutcome, t: TFunction) {
  switch (outcome) {
    case 'passed':
      return t('history.passed');
    case 'failed':
      return t('history.failed');
    default:
      return t(`status.${attempt.status}`);
  }
}

export function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const {
    data: attempts,
    error,
    isPending,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAttempts();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  // "This week" is measured from when the screen opened.
  const [now] = useState(() => Date.now());
  const sentinel = useLoadMore(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, Boolean(hasNextPage));

  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const rows = attempts ? historyRows(attempts, filter, now) : [];

  return (
    <Page className="gap-4">
      <PageTitle title={t('history.title')} />
      <PillRow>
        {HISTORY_FILTERS.map((value) => (
          <FilterPill
            key={value}
            label={t(`history.filter.${value}`)}
            isSelected={value === filter}
            onPress={() => setFilter(value)}
          />
        ))}
      </PillRow>
      {isPending ? (
        <LoadingView />
      ) : !attempts ? (
        <ErrorView error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyView message={t('history.empty')} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) =>
            row.kind === 'heading' ? (
              <p
                key={row.key}
                className="pt-2 text-xs font-semibold text-muted-foreground uppercase"
              >
                {t(`history.${row.group}`)}
              </p>
            ) : (
              <AttemptRow
                key={row.key}
                attempt={row.attempt}
                outcome={row.outcome}
                statusLabel={statusLabel(row.attempt, row.outcome, t)}
                dateLabel={dateFormat.format(new Date(row.attempt.startedAt))}
                scoreLabel={
                  row.outcome === 'progress' || row.attempt.status === 'ABANDONED'
                    ? t('history.progress', {
                        answered: row.attempt.answeredCount,
                        total: row.attempt.totalQuestions,
                      })
                    : row.attempt.score === null
                      ? null
                      : t('history.score', { score: row.attempt.score, max: row.attempt.maxScore })
                }
              />
            ),
          )}
        </div>
      )}
      <div ref={sentinel} />
      {isFetchingNextPage ? <CenteredSpinner /> : null}
    </Page>
  );
}

function AttemptRow({
  attempt,
  outcome,
  statusLabel,
  dateLabel,
  scoreLabel,
}: {
  attempt: AttemptListItem;
  outcome: RowOutcome;
  statusLabel: string;
  dateLabel: string;
  scoreLabel: string | null;
}) {
  const pill = PILL[outcome];
  const progress =
    attempt.totalQuestions > 0
      ? Math.round((attempt.answeredCount / attempt.totalQuestions) * 100)
      : 0;
  // Unfinished attempts reopen the test screen; closed ones show their result.
  const to =
    attempt.status === 'IN_PROGRESS'
      ? `/attempts/${attempt.id}`
      : `/attempts/${attempt.id}/result`;

  return (
    <Link to={to}>
      <Card className="flex items-center gap-3 transition hover:border-primary/50">
        <IconTile tone={toneFor(attempt.examId)} icon={FileText} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="line-clamp-2 text-sm font-semibold">{attempt.examTitle}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                pill.pill,
              )}
            >
              <span className={cn('size-1.5 rounded-full', pill.dot)} />
              {statusLabel}
            </span>
            <span className="text-xs text-muted-foreground">{dateLabel}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {outcome === 'progress' ? (
            <ProgressRing percent={progress} size={36} thickness={4} />
          ) : attempt.percent === null ? null : (
            <span className={cn('text-lg font-semibold', PERCENT[outcome])}>
              {`${attempt.percent}%`}
            </span>
          )}
          {scoreLabel ? <span className="text-xs text-muted-foreground">{scoreLabel}</span> : null}
        </div>
      </Card>
    </Link>
  );
}
