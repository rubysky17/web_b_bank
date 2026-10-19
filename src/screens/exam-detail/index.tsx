import type { TFunction } from 'i18next';
import { Layers, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { syncAttempt } from '@/api/attempt-sync';
import { type CatalogExamDetail, useCatalogExam, useStartAttempt } from '@/api/catalog';
import { describeError } from '@/api/errors';
import { useReportExams } from '@/api/reports';
import type { LocalAttemptSummary } from '@/attempt-engine/local-store';
import { BrandHero } from '@/components/app/brand';
import { confirm, notify } from '@/components/app/confirm';
import { IconTile, type Tone, TONES } from '@/components/app/icon-tile';
import { ProgressRing } from '@/components/app/progress-ring';
import { ErrorView, LoadingView } from '@/components/app/states';
import { ActionBar } from '@/components/app/top-bar';
import { StackedBar } from '@/components/charts';
import { Page } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useBack } from '@/hooks/use-back';
import { toParams } from '@/screens/bank/filters';
import {
  dispatchAttempt,
  useLocalAttemptForExam,
  useLocalAttempts,
} from '@/stores/attempt-sessions';
import { formatClockMs } from '@/utils/format-duration';

export function ExamDetailRoute() {
  const { id = '' } = useParams();
  return <ExamDetailScreen key={id} id={id} />;
}

function ExamDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = useBack('/');
  const { data: exam, error, isPending, refetch } = useCatalogExam(id);
  const { mutate: start, isPending: isStarting, error: startError } = useStartAttempt(id);
  // The device copy comes first: it is up to date even offline.
  const local = useLocalAttemptForExam(id);
  const localAttempts = useLocalAttempts();
  const [isResetting, setIsResetting] = useState(false);
  const { data: reportExams } = useReportExams();

  if (isPending) {
    return (
      <Page>
        <LoadingView />
      </Page>
    );
  }
  if (!exam) {
    return (
      <Page>
        <ErrorView error={error} onRetry={refetch} />
      </Page>
    );
  }
  const avgCorrect = reportExams?.find((r) => r.examId === id)?.avgCorrectPercent ?? null;

  // An attempt abandoned on the device but not uploaded yet is no longer "in progress".
  const serverInProgress = localAttempts.some(
    (a) => a.attemptId === exam.inProgressAttemptId && a.closing !== null,
  )
    ? null
    : exam.inProgressAttemptId;
  const inProgressId = local?.attemptId ?? serverInProgress;

  const openAttempt = (attemptId: string) => void navigate(`/attempts/${attemptId}`);

  const onStart = () => {
    if (inProgressId) {
      openAttempt(inProgressId);
      return;
    }
    start(undefined, { onSuccess: (attempt) => openAttempt(attempt.id) });
  };

  /** Keeps the current attempt as Unfinished (uploaded first, so offline answers are not lost). */
  const startOver = async () => {
    const ok = await confirm({
      title: t('exam.startOverTitle'),
      message: t('exam.startOverMessage'),
      confirmLabel: t('exam.startOver'),
      destructive: true,
    });
    if (!ok) return;
    setIsResetting(true);
    try {
      if (local) {
        dispatchAttempt(local.attemptId, { type: 'ATTEMPT_ABANDON' });
        const outcome = await syncAttempt(local.attemptId);
        if (outcome === 'OFFLINE') {
          await notify(t('exam.startOver'), t('exam.needOnline'));
          return;
        }
      }
      start({ fresh: true }, { onSuccess: (attempt) => openAttempt(attempt.id) });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col md:px-4 md:pt-8">
      <ExamHero exam={exam} onBack={back} />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 md:px-0">
        <ExamSummary exam={exam} avgCorrect={avgCorrect} />
        <h2 className="pt-1 text-lg font-semibold">{t('exam.structure')}</h2>
        <div className="flex flex-col gap-3 pb-4">
          {exam.sections.map((section) => (
            <SectionRow
              key={section.id}
              order={section.order}
              tone={TONES[(section.order - 1) % TONES.length]!}
              title={section.title}
              instructions={section.instructions}
              questionsLabel={t('exam.sectionQuestions', { count: section.questionCount })}
            />
          ))}
        </div>
        <ActionBar direction="column" className="md:mb-4 md:rounded-3xl md:border-b">
          {startError ? (
            <p className="text-sm text-destructive">{describeError(startError, t)}</p>
          ) : null}
          {inProgressId ? (
            <>
              <InProgressCard local={local} />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onClick={() => void startOver()}
                  disabled={isStarting || isResetting}
                >
                  {isResetting || isStarting ? <Spinner /> : null}
                  {t('exam.startOver')}
                </Button>
                <Button
                  variant="brand"
                  size="lg"
                  className="flex-1"
                  onClick={onStart}
                  disabled={isResetting}
                >
                  <Play className="fill-current" />
                  {t('exam.continue')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  void navigate(`/practice?${new URLSearchParams(toParams({ examId: exam.id }))}`)
                }
              >
                {t('exam.practiceShort')}
              </Button>
              <Button
                variant="brand"
                size="lg"
                className="flex-1"
                onClick={onStart}
                disabled={isStarting}
              >
                {isStarting ? <Spinner className="text-on-brand" /> : <Play className="fill-current" />}
                {t('exam.start')}
              </Button>
            </div>
          )}
        </ActionBar>
      </div>
    </div>
  );
}

const DIFFICULTY_BAR = {
  EASY: 'bg-success',
  MEDIUM: 'bg-chart-4',
  HARD: 'bg-destructive',
  EXPERT: 'bg-chart-3',
} as const;

function ExamHero({ exam, onBack }: { exam: CatalogExamDetail; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <BrandHero
      onBack={onBack}
      accessory={
        <span className="max-w-[50%] truncate rounded-full bg-on-brand-subtle px-3 py-1.5 text-sm font-semibold">
          {exam.topic.name}
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">{exam.title}</h1>
        <p className="text-sm text-on-brand-muted">{t('exam.by', { name: exam.owner.fullName })}</p>
        {isSectioned(exam) ? (
          <p className="text-sm text-on-brand-muted">{durationLabel(exam, t)}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <HeroFact value={String(exam.questionCount)} label={t('exam.questions')} />
        <HeroFact value={totalDuration(exam, t)} label={t('exam.duration')} />
        <HeroFact
          value={exam.passingScore === null ? t('exam.noPassMark') : `${exam.passingScore}%`}
          label={t('exam.passMark')}
        />
      </div>
    </BrandHero>
  );
}

function ExamSummary({
  exam,
  avgCorrect,
}: {
  exam: CatalogExamDetail;
  /** The user's average % correct on this exam; null = not finished yet. */
  avgCorrect: number | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      {avgCorrect === null ? null : (
        <Card className="flex items-center gap-4">
          <ProgressRing percent={avgCorrect} size={64} thickness={7}>
            <span className="text-sm font-semibold">{`${avgCorrect}%`}</span>
          </ProgressRing>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{t('exam.yourProgress')}</p>
            <p className="font-semibold">{t('exam.avgCorrect', { percent: avgCorrect })}</p>
            <p className="text-xs text-muted-foreground">
              {t('exam.myAttempts', { count: exam.myAttemptCount })}
            </p>
          </div>
        </Card>
      )}

      {exam.description ? (
        <p className="leading-relaxed whitespace-pre-line">{exam.description}</p>
      ) : null}

      {exam.breakdown.difficulties.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t('exam.byDifficulty')}</p>
          <StackedBar
            className="h-2.5"
            segments={exam.breakdown.difficulties.map((d) => ({
              key: d.difficulty,
              value: d.questionCount,
              className: DIFFICULTY_BAR[d.difficulty],
            }))}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {exam.breakdown.difficulties.map((d) => (
              <span key={d.difficulty} className="flex items-center gap-1.5 text-xs font-medium">
                <span className={`size-2 rounded-full ${DIFFICULTY_BAR[d.difficulty]}`} />
                {`${t(`difficulty.${d.difficulty}`)} ${d.questionCount}`}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {exam.breakdown.domains.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t('exam.byDomain')}</p>
          <div className="flex flex-wrap gap-2">
            {exam.breakdown.domains.map((d) => (
              <Badge key={d.domainId ?? 'none'}>{`${d.name} · ${d.questionCount}`}</Badge>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Glassy fact box on the hero. */
function HeroFact({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-on-brand-subtle p-3">
      <p className="line-clamp-2 font-semibold">{value}</p>
      <p className="truncate text-xs text-on-brand-muted">{label}</p>
    </div>
  );
}

/** Every section has its own time limit: the exam is taken section by section. */
const isSectioned = (exam: CatalogExamDetail) =>
  exam.sections.length > 0 && exam.sections.every((s) => s.durationMinutes != null);

/** Total working time, short enough for a fact box ("180 min", "Untimed"). */
function totalDuration(exam: CatalogExamDetail, t: TFunction) {
  const minutes = isSectioned(exam)
    ? exam.sections.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
    : exam.durationMinutes;
  return minutes === null ? t('home.untimed') : t('home.minutes', { count: minutes });
}

/** "3 sections × 60 min, 10-min break" for sectioned exams, else the total time. */
function durationLabel(exam: CatalogExamDetail, t: TFunction) {
  const minutes = exam.sections.map((s) => s.durationMinutes);
  const [first] = minutes;
  if (first != null && minutes.every((m) => m === first)) {
    const format = t('exam.sectionedFormat', { sections: minutes.length, minutes: first });
    return exam.breakMinutes === null
      ? format
      : `${format}, ${t('exam.breakFormat', { count: exam.breakMinutes })}`;
  }
  return exam.durationMinutes === null
    ? t('home.untimed')
    : t('home.minutes', { count: exam.durationMinutes });
}

/** "You have an unfinished attempt": section, progress and time left when the device has it. */
function InProgressCard({ local }: { local: LocalAttemptSummary | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-primary-soft p-3">
      <p className="font-semibold">{t('exam.inProgressTitle')}</p>
      <p className="text-sm text-muted-foreground">
        {local
          ? local.phase === 'IN_SECTION' || local.phase === 'IN_REVIEW'
            ? t('exam.inProgressDetail', {
                section: t('sectioned.section', { order: local.sectionOrder }),
                answered: local.sectionAnswered,
                total: local.sectionTotal,
                time: formatClockMs(local.remainingMs) ?? '',
              })
            : t('exam.inProgressAnswered', {
                answered: local.answeredCount,
                total: local.totalQuestions,
              })
          : t('exam.inProgressElsewhere')}
      </p>
    </div>
  );
}

function SectionRow({
  order,
  tone,
  title,
  instructions,
  questionsLabel,
}: {
  order: number;
  tone: Tone;
  title: string;
  instructions: string | null;
  questionsLabel: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <div className="relative">
        <IconTile tone={tone} icon={Layers} />
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-xs font-semibold">
          {order}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {instructions ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{instructions}</p>
        ) : null}
      </div>
      <Badge>{questionsLabel}</Badge>
    </Card>
  );
}
