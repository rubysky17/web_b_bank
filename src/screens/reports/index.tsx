import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  FileText,
  Flame,
  Lightbulb,
  type LucideIcon,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAttempts } from '@/api/attempts';
import { catalogExamQueryOptions } from '@/api/catalog';
import {
  type ExamReport,
  MAX_COMPARE,
  type ReportExam,
  useCompareReport,
  useExamReport,
  useReportExams,
} from '@/api/reports';
import { GradientGlow } from '@/components/app/brand';
import { IconTile, type Tone } from '@/components/app/icon-tile';
import { SegmentedControl } from '@/components/app/segmented-control';
import { CenteredSpinner, EmptyView, ErrorView, LoadingView } from '@/components/app/states';
import {
  ChartLegend,
  type LegendItem,
  LineChart,
  type LineSeries,
  OUTCOME_COLORS,
  PieChart,
  SERIES_COLORS,
} from '@/components/charts';
import { scaleLinear, toLinePath } from '@/components/charts/geometry';
import { Page, PageTitle } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useElementWidth } from '@/hooks/use-element-width';
import { cn } from '@/lib/utils';
import { countByDay, currentStreak, type HeatCell, heatmapWeeks } from '@/utils/activity';
import { formatClockMs } from '@/utils/format-duration';

import { assignSlots, mergeDomains, reportInsights, type Selection } from './rows';

type ReportMode = 'single' | 'multiple';

export function ReportsScreen() {
  const { t } = useTranslation();
  const { data: exams, error, isPending, refetch } = useReportExams();
  const [mode, setMode] = useState<ReportMode>('single');
  // null = not chosen yet: default to the most recent exam(s).
  const [pickedExamId, setPickedExamId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Selection[] | null>(null);

  const title = <PageTitle title={t('reports.title')} subtitle={t('reports.subtitle')} />;

  if (isPending || !exams || exams.length === 0) {
    return (
      <Page className="gap-4">
        {title}
        {isPending ? (
          <LoadingView />
        ) : !exams ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
          <EmptyView message={t('reports.empty')} />
        )}
      </Page>
    );
  }

  // Selections are derived, so they stay valid when the exam list changes.
  const listed = new Set(exams.map((exam) => exam.examId));
  const examId =
    pickedExamId !== null && listed.has(pickedExamId) ? pickedExamId : exams[0]!.examId;
  const selection = (
    picked ??
    assignSlots(
      [],
      exams.slice(0, 2).map((exam) => exam.examId),
      MAX_COMPARE,
    )
  ).filter((s) => listed.has(s.examId));

  return (
    <Page className="gap-4">
      {title}
      <SegmentedControl
        value={mode}
        options={[
          { value: 'single', label: t('reports.modeSingle') },
          { value: 'multiple', label: t('reports.modeMultiple') },
        ]}
        onValueChange={setMode}
      />
      <ExamPicker
        exams={exams}
        multiple={mode === 'multiple'}
        value={mode === 'single' ? [examId] : selection.map((s) => s.examId)}
        onChange={(ids) => {
          if (mode === 'single') setPickedExamId(ids[0] ?? null);
          else setPicked(assignSlots(selection, ids, MAX_COMPARE));
        }}
      />
      {mode === 'single' ? (
        <SingleReport examId={examId} />
      ) : (
        <CompareReport selection={selection} />
      )}
    </Page>
  );
}

/** Picks the exam of the single report, or 2…MAX_COMPARE exams to compare. */
function ExamPicker({
  exams,
  multiple,
  value,
  onChange,
}: {
  exams: readonly ReportExam[];
  multiple: boolean;
  /** Selected exam ids, in selection order. */
  value: readonly string[];
  onChange: (examIds: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const byId = new Map(exams.map((exam) => [exam.examId, exam]));
  const label = value
    .flatMap((id) => {
      const exam = byId.get(id);
      return exam ? [exam.examTitle] : [];
    })
    .join(', ');
  const atMax = value.length >= MAX_COMPARE;
  const hint = !multiple
    ? null
    : value.length < 2
      ? t('reports.pickMore', { count: 2 - value.length })
      : atMax
        ? t('reports.maxReached', { max: MAX_COMPARE })
        : null;

  const toggle = (id: string) => {
    if (!multiple) {
      onChange([id]);
      setOpen(false);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 items-center gap-3 rounded-3xl border bg-card px-3 text-left transition hover:border-primary/50"
      >
        <IconTile tone="blue" icon={FileText} size="sm" />
        <span className={cn('flex-1 truncate font-semibold', !label && 'text-muted-foreground')}>
          {label || (multiple ? t('reports.pickExams') : t('reports.pickExam'))}
        </span>
        <ChevronDown className="size-5 text-muted-foreground" />
      </button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh]">
          <DialogHeader>
            <DialogTitle>
              {multiple
                ? t('reports.selectedCount', { count: value.length, max: MAX_COMPARE })
                : t('reports.pickExam')}
            </DialogTitle>
            <DialogDescription className="sr-only">{t('reports.pickExam')}</DialogDescription>
          </DialogHeader>
          <div className="-mx-2 flex flex-col gap-1">
            {exams.map((exam) => {
              const isSelected = value.includes(exam.examId);
              // At the limit, only already selected exams can still be toggled.
              const isLocked = multiple && atMax && !isSelected;
              return (
                <button
                  key={exam.examId}
                  type="button"
                  disabled={isLocked}
                  onClick={() => toggle(exam.examId)}
                  aria-pressed={isSelected}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-accent disabled:opacity-40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{exam.examTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {`${t('reports.attemptCount', { count: exam.attemptCount })} · ${dateFormat.format(new Date(exam.lastAttemptAt))}`}
                    </p>
                  </div>
                  {isSelected ? <Check className="size-5 text-primary" /> : null}
                </button>
              );
            })}
          </div>
          {multiple ? (
            <Button variant="brand" onClick={() => setOpen(false)}>
              OK
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SingleReport({ examId }: { examId: string }) {
  const { t } = useTranslation();
  const { data: report, error, isPending, isPlaceholderData, refetch } = useExamReport(examId);
  // For the pass-mark tick on the domain bars (usually cached from the exam screen).
  const { data: exam } = useQuery(catalogExamQueryOptions(examId));
  const passingScore = exam?.passingScore ?? null;

  if (!report) return isPending ? <CenteredSpinner /> : <ErrorView error={error} onRetry={refetch} />;

  const { summary } = report;
  const values = report.attempts.map((attempt) => attempt.correctPercent);
  const insights = reportInsights(report);
  const isTimeEstimated = summary.timeSource === 'estimated' || summary.timeSource === 'mixed';

  return (
    // Dimmed while the previous exam's report stands in for the one loading.
    <div className={cn('flex flex-col gap-3 transition-opacity', isPlaceholderData && 'opacity-50')}>
      <ReportHero avgCorrectPercent={summary.avgCorrectPercent} values={values} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          tone="violet"
          icon={CheckCheck}
          value={String(summary.attemptCount)}
          label={t('reports.attempts')}
        />
        <Kpi
          tone="blue"
          icon={CircleHelp}
          value={String(summary.outcomes.correct + summary.outcomes.wrong)}
          label={t('reports.answered')}
        />
        <Kpi
          tone="orange"
          icon={Timer}
          value={formatClockMs(summary.avgTimePerAnswerMs) ?? '—'}
          label={t('reports.avgTime')}
          badge={isTimeEstimated ? t('reports.estimated') : null}
        />
        <Kpi
          tone="amber"
          icon={Trophy}
          value={`${summary.bestCorrectPercent}%`}
          label={t('reports.best')}
        />
      </div>
      {isTimeEstimated ? (
        <p className="text-xs text-muted-foreground">{t('reports.estimatedHint')}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <OutcomesCard {...summary.outcomes} />
        <TrendCard
          area
          series={[{ key: report.examId, color: 'var(--primary)', values }]}
          label={values
            .map((percent, index) => t('reports.attemptValue', { n: index + 1, percent }))
            .join(', ')}
        />
      </div>
      {report.domains.length > 0 ? (
        <section className="flex flex-col pt-2">
          <h2 className="pb-3 text-lg font-semibold">{t('reports.byDomain')}</h2>
          {report.domains.map((domain, index) => (
            <DomainRow
              key={domain.domainId ?? 'none'}
              name={domain.name ?? t('reports.noDomain')}
              total={domain.total}
              correct={domain.correct}
              percent={domain.correctPercent}
              avgTime={formatClockMs(domain.avgTimePerAnswerMs)}
              index={index}
              passingScore={passingScore}
            />
          ))}
        </section>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <ActivityCard />
        {insights ? (
          <Card className="flex flex-col gap-4">
            <p className="font-semibold">{t('reports.insights')}</p>
            <Insight
              tone="violet"
              icon={Trophy}
              title={t('reports.strongest', { name: insights.strongest.name ?? '' })}
              detail={t('reports.strongestDetail', { percent: insights.strongest.correctPercent })}
            />
            {insights.weakest ? (
              <Insight
                tone="orange"
                icon={CircleAlert}
                title={t('reports.weakest', { name: insights.weakest.name ?? '' })}
                detail={t('reports.weakestDetail', { percent: insights.weakest.correctPercent })}
              />
            ) : null}
            {insights.slowest ? (
              <Insight
                tone="blue"
                icon={Lightbulb}
                title={t('reports.slowest', { name: insights.slowest.name ?? '' })}
                detail={t('reports.slowestDetail', {
                  time: formatClockMs(insights.slowest.avgTimePerAnswerMs) ?? '',
                })}
              />
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function CompareReport({ selection }: { selection: readonly Selection[] }) {
  const { t } = useTranslation();
  const examIds = selection.map((s) => s.examId);
  const canCompare = examIds.length >= 2;
  const { data: reports, error, isPending, isPlaceholderData, refetch } = useCompareReport(examIds);
  const slots = new Map(selection.map((s) => [s.examId, s.slot]));
  // By exam, not position: a placeholder from the previous selection may be on screen.
  const colorOf = (examId: string) => SERIES_COLORS[slots.get(examId) ?? 0] ?? SERIES_COLORS[0]!;

  if (!canCompare) return <EmptyView message={t('reports.notEnough')} />;
  if (!reports) return isPending ? <CenteredSpinner /> : <ErrorView error={error} onRetry={refetch} />;

  const domains = mergeDomains(reports);

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', isPlaceholderData && 'opacity-50')}>
      <TrendCard
        series={reports.map((report) => ({
          key: report.examId,
          color: colorOf(report.examId),
          values: report.attempts.map((attempt) => attempt.correctPercent),
        }))}
        legend={reports.map((report) => ({
          key: report.examId,
          label: report.examTitle,
          color: colorOf(report.examId),
        }))}
        label={reports
          .map(
            (report) =>
              `${report.examTitle}: ${report.attempts
                .map((attempt, index) =>
                  t('reports.attemptValue', { n: index + 1, percent: attempt.correctPercent }),
                )
                .join(', ')}`,
          )
          .join('. ')}
      />
      <h2 className="pt-2 text-lg font-semibold">{t('reports.overview')}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {reports.map((report) => (
          <ExamCompareRow key={report.examId} report={report} color={colorOf(report.examId)} />
        ))}
      </div>
      {domains.length > 0 ? (
        <section className="flex flex-col pt-2">
          <h2 className="pb-3 text-lg font-semibold">{t('reports.byDomain')}</h2>
          {domains.map((domain) => (
            <div key={domain.key} className="flex flex-col gap-2 pb-4">
              <p className="truncate font-medium">{domain.name ?? t('reports.noDomain')}</p>
              {domain.byExam.map((row, index) => {
                const report = reports[index];
                const percent = row?.correctPercent ?? null;
                return (
                  <div
                    key={report?.examId ?? index}
                    className="flex items-center gap-2"
                    aria-label={`${report?.examTitle ?? ''}: ${
                      percent === null ? t('reports.notCovered') : `${percent}%`
                    }`}
                  >
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      {percent === null ? null : (
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: colorOf(report?.examId ?? ''),
                          }}
                        />
                      )}
                    </div>
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {percent === null ? '—' : `${percent}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

const SPARK_HEIGHT = 48;

/** Gradient card: average % correct, change since the first attempt and a sparkline. */
function ReportHero({ avgCorrectPercent, values }: { avgCorrectPercent: number; values: readonly number[] }) {
  const { t } = useTranslation();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const first = values[0];
  const last = values[values.length - 1];
  const delta =
    first !== undefined && last !== undefined && values.length > 1 ? last - first : null;
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values, 0);
  const x = scaleLinear([0, Math.max(values.length - 1, 1)], [2, width - 2]);
  const y = scaleLinear([lo, hi], [SPARK_HEIGHT - 4, 4]);
  const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
  const path = toLinePath(points);

  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-3xl bg-brand-gradient p-5 text-on-brand">
      <GradientGlow className="-top-20 -right-12 size-52" />
      <p className="relative text-sm font-medium text-on-brand-muted">{t('reports.avgCorrect')}</p>
      <div className="relative flex items-center gap-3">
        <span className="text-[44px] leading-[48px] font-bold">{`${avgCorrectPercent}%`}</span>
        {delta === null ? null : (
          <span className="flex items-center gap-1 rounded-full bg-on-brand-subtle px-2 py-1 text-xs font-semibold">
            {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {t('reports.sinceFirst', { delta: `${delta >= 0 ? '+' : ''}${delta}` })}
          </span>
        )}
      </div>
      {values.length > 1 ? (
        <div ref={ref} className="relative" style={{ height: SPARK_HEIGHT }}>
          {width > 0 ? (
            <svg width={width} height={SPARK_HEIGHT}>
              <path
                d={`${path} L${points[points.length - 1]!.x} ${SPARK_HEIGHT} L${points[0]!.x} ${SPARK_HEIGHT} Z`}
                fill="var(--on-brand-faint)"
              />
              <path
                d={path}
                fill="none"
                stroke="var(--on-brand)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  tone,
  icon,
  value,
  label,
  badge,
}: {
  tone: Tone;
  icon: LucideIcon;
  value: string;
  label: string;
  badge?: string | null;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <IconTile tone={tone} icon={icon} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <p className="truncate font-semibold">{value}</p>
          {badge ? <Badge variant="warning">{badge}</Badge> : null}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

/** Donut of correct / wrong / unanswered answers over every attempt. */
function OutcomesCard({ correct, wrong, unanswered }: { correct: number; wrong: number; unanswered: number }) {
  const { t } = useTranslation();
  const total = correct + wrong + unanswered;
  const percent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
  const outcomes = [
    { key: 'correct', label: t('reports.correct'), color: OUTCOME_COLORS.correct, count: correct },
    { key: 'wrong', label: t('reports.wrong'), color: OUTCOME_COLORS.wrong, count: wrong },
    {
      key: 'unanswered',
      label: t('reports.unanswered'),
      color: OUTCOME_COLORS.unanswered,
      count: unanswered,
    },
  ];

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="font-semibold">{t('reports.outcomes')}</p>
        <p className="text-xs text-muted-foreground">{t('reports.outcomesSub', { count: total })}</p>
      </div>
      <div className="flex items-center gap-5">
        <PieChart
          size={132}
          thickness={16}
          slices={outcomes.map(({ key, count, color }) => ({ key, value: count, color }))}
          label={t('reports.outcomesSummary', { correct, wrong, unanswered })}
        >
          <span className="text-2xl font-bold">{`${percent(correct)}%`}</span>
          <span className="text-xs text-muted-foreground">{t('reports.correctCaption')}</span>
        </PieChart>
        <ChartLegend
          className="min-w-0 flex-1"
          items={outcomes.map(({ key, label, color, count }) => ({
            key,
            label,
            color,
            value: t('reports.outcomeValue', { count, percent: percent(count) }),
          }))}
        />
      </div>
    </Card>
  );
}

/** % correct per attempt (x = attempt number). */
function TrendCard({
  series,
  area = false,
  legend,
  label,
}: {
  series: readonly LineSeries[];
  area?: boolean;
  legend?: readonly LegendItem[];
  label: string;
}) {
  const { t } = useTranslation();
  const longest = Math.max(0, ...series.map((s) => s.values.length));
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{t('reports.trend')}</p>
        <p className="text-xs text-muted-foreground">{t('reports.trendSub')}</p>
      </div>
      <LineChart series={series} area={area} label={label} />
      <p className="text-center text-xs text-muted-foreground">
        {longest < 2 ? t('reports.oneAttempt') : t('reports.attemptAxis')}
      </p>
      {legend ? <ChartLegend items={legend} /> : null}
    </Card>
  );
}

/** Bar colors cycle through the series palette (green/red stay for correct/wrong). */
const BAR_COLORS = ['bg-chart-1', 'bg-chart-3', 'bg-chart-2', 'bg-chart-5', 'bg-chart-4'] as const;

function DomainRow({
  name,
  total,
  correct,
  percent,
  avgTime,
  index,
  passingScore,
}: {
  name: string;
  total: number;
  correct: number;
  percent: number;
  avgTime: string | null;
  index: number;
  /** Exam pass mark, drawn as a tick on the bar; null = none. */
  passingScore: number | null;
}) {
  const { t } = useTranslation();
  const isBelowPass = passingScore !== null && percent < passingScore;
  return (
    <div className="flex flex-col gap-1.5 pb-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex-1 truncate font-medium">{name}</p>
        <span
          className={cn(
            'text-sm font-semibold',
            isBelowPass ? 'text-warning-soft-foreground' : 'text-foreground',
          )}
        >
          {`${percent}%`}
        </span>
      </div>
      <div className="relative flex h-2.5 items-center">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn('h-full rounded-full', BAR_COLORS[index % BAR_COLORS.length])}
            style={{ width: `${percent}%` }}
          />
        </div>
        {passingScore === null ? null : (
          <div
            className="absolute h-4 w-0.5 rounded-full bg-foreground"
            style={{ left: `${passingScore}%` }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {avgTime === null
          ? t('reports.domainCount', { correct, total })
          : `${t('reports.domainCount', { correct, total })} · ${t('reports.domainTime', { time: avgTime })}`}
      </p>
    </div>
  );
}

function ExamCompareRow({ report, color }: { report: ExamReport; color: string }) {
  const { t } = useTranslation();
  const { summary } = report;
  const { correct, wrong, unanswered } = summary.outcomes;
  const avgTime = formatClockMs(summary.avgTimePerAnswerMs);
  const isTimeEstimated = summary.timeSource === 'estimated' || summary.timeSource === 'mixed';
  return (
    <Card className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <p className="line-clamp-2 flex-1 font-semibold">{report.examTitle}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('reports.examStats', { percent: summary.avgCorrectPercent, count: summary.attemptCount })}
        </p>
        <p className="text-sm text-muted-foreground">
          {`${t('reports.avgTime')}: ${
            avgTime === null ? '—' : t('reports.perAnswer', { time: avgTime })
          }${isTimeEstimated ? ` (${t('reports.estimated')})` : ''}`}
        </p>
      </div>
      <PieChart
        size={64}
        thickness={9}
        slices={[
          { key: 'correct', value: correct, color: OUTCOME_COLORS.correct },
          { key: 'wrong', value: wrong, color: OUTCOME_COLORS.wrong },
          { key: 'unanswered', value: unanswered, color: OUTCOME_COLORS.unanswered },
        ]}
        label={t('reports.outcomesSummary', { correct, wrong, unanswered })}
      >
        <span className="text-xs font-semibold">{`${summary.avgCorrectPercent}%`}</span>
      </PieChart>
    </Card>
  );
}

function Insight({
  tone,
  icon,
  title,
  detail,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconTile tone={tone} icon={icon} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

// Literal class names so Tailwind generates them.
const LEVEL = ['bg-secondary', 'bg-chart-1-soft', 'bg-brand-glow', 'bg-chart-1'] as const;

/** Monday-first day initials (Intl, so they follow the app language). */
function weekdayInitials(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  // 2026-10-12 is a Monday.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2026, 9, 12 + i)));
}

/** Attempts per day over the last 5 weeks (all exams) and the current day streak. */
function ActivityCard() {
  const { t, i18n } = useTranslation();
  const { data: attempts, isPending } = useAttempts();
  if (isPending) return <Skeleton className="h-56 rounded-3xl" />;
  if (!attempts) return null;

  const counts = countByDay(attempts.map((a) => a.startedAt));
  const today = new Date();
  const weeks = heatmapWeeks(counts, today);
  const streak = currentStreak(counts, today);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center">
        <div className="flex-1">
          <p className="font-semibold">{t('reports.activity')}</p>
          <p className="text-xs text-muted-foreground">{t('reports.activitySub')}</p>
        </div>
        <span className="flex items-center gap-1 text-sm font-semibold">
          <Flame className="size-4 text-chart-4" />
          {t('reports.streak', { count: streak })}
        </span>
      </div>
      <div
        className="flex flex-col gap-1.5"
        role="img"
        aria-label={t('reports.activitySummary', {
          count: weeks.flat().reduce((sum, cell) => sum + cell.count, 0),
        })}
      >
        <div className="flex gap-1.5">
          {weekdayInitials(i18n.language).map((day, index) => (
            <span key={index} className="flex-1 text-center text-xs text-muted-foreground">
              {day}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]!.key} className="flex gap-1.5">
            {week.map((cell) => (
              <Cell key={cell.key} cell={cell} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
        {t('reports.less')}
        {LEVEL.map((className) => (
          <span key={className} className={cn('size-3 rounded', className)} />
        ))}
        {t('reports.more')}
      </div>
    </Card>
  );
}

function Cell({ cell }: { cell: HeatCell }) {
  return (
    <div
      title={cell.count > 0 ? `${cell.key}: ${cell.count}` : cell.key}
      className={cn(
        'h-7 flex-1 rounded-lg',
        cell.isFuture ? 'border border-dashed' : LEVEL[cell.level],
      )}
    />
  );
}
