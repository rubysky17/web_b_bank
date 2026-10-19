import type { TFunction } from 'i18next';
import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Gauge,
  type LucideIcon,
  Timer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { type AttemptResult, useAttemptResult, useAttemptReview } from '@/api/attempts';
import { BrandHero } from '@/components/app/brand';
import { IconTile } from '@/components/app/icon-tile';
import { ProgressRing } from '@/components/app/progress-ring';
import { ErrorView, LoadingView } from '@/components/app/states';
import { ActionBar } from '@/components/app/top-bar';
import { Page } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  NO_DOMAIN,
  type Outcome,
  type ReviewFilters,
  toReviewParams,
} from '@/screens/review/review-filters';
import { formatClock, formatClockMs } from '@/utils/format-duration';

import { decisionInsights, GUESS_UNDER_MS } from './insights';

export function ResultRoute() {
  const { id = '' } = useParams();
  return <ResultScreen key={id} id={id} />;
}

type Group = {
  key: string;
  title: string;
  rows: {
    key: string;
    label: string;
    correct: number;
    total: number;
    percent: number;
    /** Review filters opening the questions of this group; null when they can't be told apart. */
    filter: Partial<ReviewFilters> | null;
  }[];
};

/** Breakdown tables: sections, domains and difficulties. */
function breakdownGroups(result: AttemptResult, t: TFunction): Group[] {
  const { sections, domains, difficulties } = result.breakdown;
  return [
    {
      key: 'sections',
      title: t('result.bySection'),
      rows: sections.map((s) => ({
        key: `s-${s.order}`,
        label: s.title,
        ...s,
        filter: s.sectionId === null ? null : { sectionIds: [s.sectionId] },
      })),
    },
    {
      key: 'domains',
      title: t('result.byDomain'),
      rows: domains.map((d) => ({
        key: `d-${d.domainId ?? 'none'}`,
        label: d.name,
        ...d,
        filter: { domainIds: [d.domainId ?? NO_DOMAIN] },
      })),
    },
    {
      key: 'difficulties',
      title: t('result.byDifficulty'),
      rows: difficulties.map((d) => ({
        key: `x-${d.difficulty}`,
        label: t(`difficulty.${d.difficulty}`),
        ...d,
        filter: { difficulties: [d.difficulty] },
      })),
    },
  ];
}

function ResultScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: result, error, isPending, refetch } = useAttemptResult(id);

  const openReview = (filter: Partial<ReviewFilters> = {}) =>
    void navigate(`/attempts/${id}/review?${new URLSearchParams(toReviewParams(filter))}`);
  const done = () => void navigate('/', { replace: true });

  if (isPending) {
    return (
      <Page>
        <LoadingView />
      </Page>
    );
  }
  if (!result) {
    return (
      <Page>
        <ErrorView error={error} onRetry={refetch} />
      </Page>
    );
  }

  const wrong = Math.max(0, result.answeredCount - result.correctCount);
  const unanswered = Math.max(0, result.totalQuestions - result.answeredCount);
  const perQuestion =
    result.timeSpentSeconds === null || result.answeredCount === 0
      ? null
      : formatClock(result.timeSpentSeconds / result.answeredCount);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col md:px-4 md:pt-8">
      <BrandHero onBack={done} title={t('result.title')} className="items-center text-center">
        <div className="flex flex-col items-center gap-3 duration-500 animate-in fade-in zoom-in-95">
          <p className="line-clamp-2 text-sm text-on-brand-muted">{result.examTitle}</p>
          <ProgressRing percent={result.percent} size={148} thickness={12} variant="on-brand">
            <span className="text-4xl font-bold">{`${result.percent}%`}</span>
            <span className="text-xs text-on-brand-muted">
              {t('result.scoreOf', { score: result.score, max: result.maxScore })}
            </span>
          </ProgressRing>
          <div className="flex flex-wrap justify-center gap-2">
            {result.passed === null ? null : (
              <span
                className={cn(
                  'rounded-full bg-on-brand px-3 py-1 text-sm font-semibold',
                  result.passed ? 'text-success-soft-foreground' : 'text-destructive',
                )}
              >
                {result.passed ? t('result.passed') : t('result.failed')}
              </span>
            )}
            {result.status === 'EXPIRED' || result.status === 'ABANDONED' ? (
              <Badge variant="warning">{t(`status.${result.status}`)}</Badge>
            ) : null}
          </div>
          {result.passingScore === null ? null : (
            <p className="text-sm text-on-brand-muted">
              {t('result.passMark', { percent: result.passingScore })}
            </p>
          )}
        </div>
      </BrandHero>

      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 md:px-0">
        <div className="grid grid-cols-3 gap-2">
          <OutcomeCard
            icon={CircleCheck}
            className="text-success"
            value={result.correctCount}
            label={t('result.correct')}
            onPress={() => openReview({ outcomes: ['correct'] satisfies Outcome[] })}
          />
          <OutcomeCard
            icon={CircleX}
            className="text-destructive"
            value={wrong}
            label={t('result.wrong')}
            onPress={() => openReview({ outcomes: ['wrong'] })}
          />
          <OutcomeCard
            icon={CircleHelp}
            className="text-muted-foreground"
            value={unanswered}
            label={t('result.skipped')}
            onPress={() => openReview({ outcomes: ['notAnswered'] })}
          />
        </div>
        <Card className="grid grid-cols-2 gap-3">
          <TimeFact
            icon={Timer}
            tone="blue"
            value={result.timeSpentSeconds === null ? '—' : formatClock(result.timeSpentSeconds)}
            label={t('result.timeSpent')}
          />
          <TimeFact
            icon={Gauge}
            tone="violet"
            value={perQuestion ?? '—'}
            label={t('result.perQuestion')}
          />
        </Card>
        {result.mode === 'SECTIONED' ? <DecisionInsights result={result} /> : null}

        {breakdownGroups(result, t).map((group) =>
          group.rows.length === 0 ? null : (
            <section key={group.key} className="flex flex-col gap-1">
              <h2 className="pt-2 pb-2 text-lg font-semibold">{group.title}</h2>
              {group.rows.map((row, index) => (
                <TallyRow
                  key={row.key}
                  index={index}
                  label={row.label}
                  percent={row.percent}
                  detail={t('result.tally', { correct: row.correct, total: row.total })}
                  onPress={row.filter ? () => openReview(row.filter ?? {}) : undefined}
                />
              ))}
            </section>
          ),
        )}
        <div className="pb-4" />

        <ActionBar className="md:mb-4 md:rounded-3xl md:border-b">
          <Button variant="secondary" size="lg" className="flex-1" onClick={done}>
            {t('result.done')}
          </Button>
          <Button variant="brand" size="lg" className="flex-1" onClick={() => openReview()}>
            {t('result.review')}
          </Button>
        </ActionBar>
      </div>
    </div>
  );
}

/** Count of one outcome; opens the review of those questions (none to show → disabled). */
function OutcomeCard({
  icon: Icon,
  className,
  value,
  label,
  onPress,
}: {
  icon: LucideIcon;
  className: string;
  value: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={value === 0}
      className="flex flex-col items-center gap-1 rounded-3xl border bg-card px-2 py-3 transition enabled:hover:border-primary/50 disabled:cursor-default"
    >
      <Icon className={cn('size-5', className)} />
      <span className="text-2xl font-bold">{value}</span>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

function TimeFact({
  icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: 'blue' | 'violet';
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <IconTile tone={tone} icon={icon} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** Bar colors cycle through the series palette (green/red stay for correct/wrong). */
const BAR_COLORS = ['bg-chart-1', 'bg-chart-3', 'bg-chart-2', 'bg-chart-5', 'bg-chart-4'] as const;

function TallyRow({
  index,
  label,
  percent,
  detail,
  onPress,
}: {
  index: number;
  label: string;
  percent: number;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      className="flex flex-col gap-1.5 rounded-2xl px-2 py-2 text-left transition enabled:hover:bg-accent disabled:cursor-default"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex-1 truncate font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{`${detail} · ${percent}%`}</span>
        {onPress ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-secondary">
        <span
          className={cn('block h-full rounded-full', BAR_COLORS[index % BAR_COLORS.length])}
          style={{ width: `${percent}%` }}
        />
      </span>
    </button>
  );
}

/** Sectioned attempts: what the decision trace says (confidence, guesses, crossing out, pacing). */
function DecisionInsights({ result }: { result: AttemptResult }) {
  const { t } = useTranslation();
  const { data: review, isPending } = useAttemptReview(result.attemptId);
  if (isPending) return <Skeleton className="h-40 rounded-3xl" />;
  if (!review) return null;

  const insight = decisionInsights(review.questions, result);
  const { confidence: c } = insight;
  const quadrants = [
    {
      key: 'mastered',
      count: c.HIGH.correct + c.MEDIUM.correct,
      title: t('insights.mastered'),
      hint: t('insights.masteredHint'),
      tone: 'text-success',
    },
    {
      key: 'misconception',
      count: c.HIGH.wrong,
      title: t('insights.misconception'),
      hint: t('insights.misconceptionHint'),
      tone: 'text-destructive',
    },
    {
      key: 'lucky',
      count: c.LOW.correct,
      title: t('insights.lucky'),
      hint: t('insights.luckyHint'),
      tone: 'text-warning',
    },
    {
      key: 'gap',
      count: c.LOW.wrong + c.MEDIUM.wrong,
      title: t('insights.gap'),
      hint: t('insights.gapHint'),
      tone: 'text-destructive',
    },
  ];
  const unrated = c.NONE.correct + c.NONE.wrong;
  const { elimination: e, changes, flags } = insight;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm font-medium text-muted-foreground">{t('insights.title')}</p>
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{t('insights.confidenceTitle')}</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:grid-cols-4">
          {quadrants.map((q) => (
            <div key={q.key} className="flex flex-col gap-0.5">
              <span className={cn('text-2xl font-bold', q.tone)}>{q.count}</span>
              <span className="text-sm font-medium">{q.title}</span>
              <span className="text-xs text-muted-foreground">{q.hint}</span>
            </div>
          ))}
        </div>
        {unrated > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('insights.noConfidence', { count: unrated })}
          </p>
        ) : null}
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <InsightCard
          title={t('insights.guessTitle')}
          lines={[
            t('insights.guessDetail', {
              count: insight.guesses.count,
              correct: insight.guesses.correct,
              seconds: GUESS_UNDER_MS / 1000,
            }),
          ]}
        />
        {e.total > 0 ? (
          <InsightCard
            title={t('insights.eliminationTitle')}
            lines={[
              t('insights.eliminationDetail', {
                total: e.total,
                percent: Math.round((e.wrongOptions / e.total) * 100),
              }),
              e.correctEliminated > 0
                ? t('insights.eliminatedCorrect', { count: e.correctEliminated })
                : null,
            ]}
          />
        ) : null}
        {changes.wrongToRight + changes.rightToWrong + changes.wrongToWrong > 0 ? (
          <InsightCard
            title={t('insights.changesTitle')}
            lines={[t('insights.changesDetail', changes)]}
          />
        ) : null}
        {flags.total > 0 ? (
          <InsightCard title={t('insights.flagsTitle')} lines={[t('insights.flagsDetail', flags)]} />
        ) : null}
      </div>
      <InsightCard
        title={t('insights.pacingTitle')}
        lines={[
          ...insight.sections.flatMap((s) => [
            t('insights.sectionPace', {
              title: s.title,
              used: formatClockMs(s.usedMs) ?? '',
              budget: formatClockMs(s.budgetMs) ?? '',
              avg: formatClockMs(s.avgAnswerMs) ?? '—',
            }),
            s.breakSkipped
              ? t('insights.breakSkipped')
              : s.breakTakenMs
                ? t('insights.breakTaken', { time: formatClockMs(s.breakTakenMs) ?? '' })
                : null,
          ]),
          insight.slowest.length > 0
            ? t('insights.slowest', {
                items: insight.slowest
                  .map((q) => `#${q.order} (${formatClockMs(q.dwellMs) ?? ''})`)
                  .join(', '),
              })
            : null,
        ]}
      />
    </div>
  );
}

function InsightCard({ title, lines }: { title: string; lines: (string | null)[] }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <p className="font-semibold">{title}</p>
      {lines.map((line, index) =>
        line === null ? null : (
          <p key={index} className="text-sm leading-5 text-muted-foreground">
            {line}
          </p>
        ),
      )}
    </Card>
  );
}
