import {
  Award,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Clock,
  FileText,
  Flame,
  type LucideIcon,
  Play,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAttempts } from '@/api/attempts';
import { useMe } from '@/api/auth';
import { useCatalog } from '@/api/catalog';
import { useReportExams } from '@/api/reports';
import { BrandCard, GradientProgress } from '@/components/app/brand';
import { IconTile, type Tone, toneFor } from '@/components/app/icon-tile';
import { ProgressRing } from '@/components/app/progress-ring';
import { CenteredSpinner, EmptyView, ErrorView } from '@/components/app/states';
import { Avatar, Page } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLoadMore } from '@/hooks/use-load-more';
import { cn } from '@/lib/utils';
import { useLocalAttempts } from '@/stores/attempt-sessions';
import { useSettingsStore } from '@/stores/settings-store';
import { answeredToday, countByDay, currentStreak } from '@/utils/activity';

export function HomeScreen() {
  const { t } = useTranslation();
  const {
    data: exams,
    error,
    isPending,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCatalog();
  const { data: reportExams } = useReportExams();
  const avgByExam = new Map(reportExams?.map((r) => [r.examId, r.avgCorrectPercent]));
  const sentinel = useLoadMore(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, Boolean(hasNextPage));

  if (isPending) return <HomeSkeleton />;

  return (
    <Page className="gap-4">
      <HomeHeader />
      <ContinueCards />
      {exams ? (
        <>
          <DailyGoalCard />
          <HomeStats />
          <h2 className="pt-1 text-lg font-semibold">{t('home.title')}</h2>
          {exams.length === 0 ? <EmptyView /> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {exams.map((exam, index) => {
              const avgPercent = avgByExam.get(exam.id) ?? null;
              return (
                <ExamCard
                  key={exam.id}
                  index={index}
                  id={exam.id}
                  title={exam.title}
                  topic={exam.topic.name}
                  tone={toneFor(exam.topic.id)}
                  avgPercent={avgPercent}
                  avgLabel={avgPercent === null ? t('home.notTaken') : t('home.avgCorrect')}
                  isBelowPass={
                    avgPercent !== null &&
                    exam.passingScore !== null &&
                    avgPercent < exam.passingScore
                  }
                  questionsLabel={t('home.questions', { count: exam.questionCount })}
                  durationLabel={
                    exam.durationMinutes === null
                      ? t('home.untimed')
                      : t('home.minutes', { count: exam.durationMinutes })
                  }
                  passLabel={
                    exam.passingScore === null
                      ? null
                      : t('home.passMark', { percent: exam.passingScore })
                  }
                />
              );
            })}
          </div>
          <div ref={sentinel} />
          {isFetchingNextPage ? <CenteredSpinner /> : null}
        </>
      ) : (
        // Offline: the exam list can't load, but unfinished attempts on the device can be continued.
        <ErrorView error={error} onRetry={refetch} />
      )}
    </Page>
  );
}

function HomeHeader() {
  const { t } = useTranslation();
  const { data: me, isPending } = useMe();
  return (
    <div className="flex items-center gap-3">
      <Avatar name={me?.fullName ?? ''} className="size-11" />
      {isPending ? (
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-3 w-52 rounded-full" />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">
            {t('home.greeting', { name: me?.fullName ?? '' })}
          </p>
          <p className="text-xs text-muted-foreground">{t('home.subtitle')}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Unfinished attempts kept in this browser (shown offline too): the latest as a gradient card, the
 * others as compact rows.
 */
export function ContinueCards() {
  const { t } = useTranslation();
  const unfinished = useLocalAttempts().filter((a) => a.closing === null);
  const [latest, ...others] = unfinished;
  if (!latest) return null;
  const progress = latest.totalQuestions > 0 ? latest.answeredCount / latest.totalQuestions : 0;

  return (
    <div className="flex flex-col gap-2">
      <Link to={`/attempts/${latest.attemptId}`} className="rounded-3xl transition hover:brightness-105">
        <BrandCard className="text-on-brand">
          <span className="flex items-center gap-1 self-start rounded-full bg-on-brand-subtle px-2 py-1 text-xs font-semibold">
            <Flame className="size-3" />
            {t('home.inProgress')}
          </span>
          <p className="line-clamp-2 text-lg font-semibold">{latest.examTitle}</p>
          <p className="text-sm text-on-brand-muted">
            {t('home.continueMeta', {
              section: t('sectioned.section', { order: latest.sectionOrder }),
              answered: latest.answeredCount,
              total: latest.totalQuestions,
            })}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-on-brand-track">
            <div
              className="h-full rounded-full bg-on-brand"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="flex h-11 items-center gap-2 self-start rounded-full bg-on-brand px-5 font-medium text-brand-end">
            <Play className="size-4 fill-current" />
            {t('home.resume')}
          </span>
        </BrandCard>
      </Link>
      {others.map((attempt) => (
        <Link key={attempt.attemptId} to={`/attempts/${attempt.attemptId}`}>
          <Card className="flex items-center gap-3 transition hover:border-primary/50">
            <CirclePlay className="size-7 shrink-0 text-primary" />
            <p className="line-clamp-2 flex-1 text-sm">
              {t('home.continueDetail', {
                title: attempt.examTitle,
                section: t('sectioned.section', { order: attempt.sectionOrder }),
                answered: attempt.answeredCount,
                total: attempt.totalQuestions,
              })}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/** Today's answered questions against the daily goal set in Settings (hidden without a goal). */
function DailyGoalCard() {
  const { t } = useTranslation();
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const { data: attempts } = useAttempts();
  const local = useLocalAttempts();
  if (dailyGoal === null || !attempts) return null;

  const done = answeredToday(attempts, local, new Date());
  const percent = Math.min(100, Math.round((done / dailyGoal) * 100));

  return (
    <Card className="flex items-center gap-4">
      <ProgressRing percent={percent} size={56} thickness={6}>
        <span className="text-xs font-semibold">{`${percent}%`}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{t('home.goalTitle')}</p>
        <p className="truncate font-semibold">
          {t('home.goalProgress', { done: Math.min(done, dailyGoal), goal: dailyGoal })}
        </p>
        <p className="text-xs text-muted-foreground">
          {done >= dailyGoal ? t('home.goalDone') : t('home.goalLeft', { count: dailyGoal - done })}
        </p>
      </div>
    </Card>
  );
}

/**
 * Day streak (from the loaded attempt history), average % correct and finished attempts (from the
 * report summaries). Shown only once the user has finished an exam.
 */
function HomeStats() {
  const { t } = useTranslation();
  const { data: reportExams } = useReportExams();
  const { data: attempts } = useAttempts();
  if (!reportExams || reportExams.length === 0) return null;

  const finished = reportExams.reduce((sum, exam) => sum + exam.attemptCount, 0);
  const avgCorrect = Math.round(
    reportExams.reduce((sum, exam) => sum + exam.avgCorrectPercent * exam.attemptCount, 0) /
      Math.max(finished, 1),
  );
  const streak = attempts
    ? currentStreak(countByDay(attempts.map((a) => a.startedAt)), new Date())
    : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat
        tone="orange"
        icon={Flame}
        value={streak === null ? '—' : String(streak)}
        label={t('home.streak', { count: streak ?? 0 })}
      />
      <Stat tone="blue" icon={TrendingUp} value={`${avgCorrect}%`} label={t('home.avgCorrect')} />
      <Stat
        tone="violet"
        icon={CheckCheck}
        value={String(finished)}
        label={t('home.finished', { count: finished })}
      />
    </div>
  );
}

function Stat({
  tone,
  icon,
  value,
  label,
}: {
  tone: Tone;
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <Card className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-3 md:p-4">
      <IconTile tone={tone} icon={icon} size="sm" />
      <div className="min-w-0">
        <p className="text-2xl font-bold">{value}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

type ExamCardProps = {
  id: string;
  title: string;
  topic: string;
  tone: Tone;
  questionsLabel: string;
  durationLabel: string;
  passLabel: string | null;
  /** Average % correct over the user's attempts; null = not taken yet. */
  avgPercent: number | null;
  avgLabel: string;
  isBelowPass: boolean;
  index: number;
};

function ExamCard({
  id,
  title,
  topic,
  tone,
  questionsLabel,
  durationLabel,
  passLabel,
  avgPercent,
  avgLabel,
  isBelowPass,
  index,
}: ExamCardProps) {
  return (
    <Link
      to={`/exams/${id}`}
      className="fill-mode-both duration-500 animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <Card className="flex h-full flex-col gap-3 transition hover:border-primary/50 hover:shadow-md">
        <div className="flex items-center gap-3">
          <IconTile tone={tone} icon={FileText} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {topic}
            </p>
            <p className="line-clamp-2 font-semibold">{title}</p>
          </div>
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill icon={CircleHelp} label={questionsLabel} />
          <Pill icon={Clock} label={durationLabel} />
          {passLabel ? <Pill icon={Award} label={passLabel} /> : null}
        </div>
        <div className="mt-auto flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{avgLabel}</span>
            {avgPercent === null ? null : (
              <span
                className={cn(
                  'font-semibold',
                  isBelowPass ? 'text-warning-soft-foreground' : 'text-success-soft-foreground',
                )}
              >
                {`${avgPercent}%`}
              </span>
            )}
          </div>
          {avgPercent === null ? null : <GradientProgress percent={avgPercent} />}
        </div>
      </Card>
    </Link>
  );
}

function Pill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-medium">
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </span>
  );
}

/** Placeholder with the home layout while the exam list loads (Figma "v2 · 02 Loading"). */
function HomeSkeleton() {
  return (
    <Page className="gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-36 rounded-full" />
          <Skeleton className="h-3 w-52 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-44 rounded-3xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-4 w-28 rounded-full" />
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-36 rounded-3xl" />
      ))}
    </Page>
  );
}
