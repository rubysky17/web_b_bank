import { ArrowRight, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { clockOffsetMs } from '@/api/attempt-state';
import { type AttemptQuestion, useAttempt, useSaveAnswer, useSubmitAttempt } from '@/api/attempts';
import { describeError, toApiError } from '@/api/errors';
import { confirm } from '@/components/app/confirm';
import { ErrorView, LoadingView } from '@/components/app/states';
import { ActionBar, TopBar } from '@/components/app/top-bar';
import { FocusPage } from '@/components/layout/app-shell';
import {
  type Answer,
  AnswerView,
  parseAnswer,
  parseInput,
  QuestionStem,
  QuestionTags,
  useQuestionLabel,
} from '@/components/question';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { NoteModeBanner, NoteToggle } from '@/components/vocab/note-toggle';
import { VocabScope } from '@/components/vocab/vocab-scope';
import { exitNoteMode, toggleNoteMode } from '@/components/vocab/vocab-ui-store';

import { FlagButton, PrevButton, QuestionProgress, QuestionStrip, TimerBadge } from './parts';
import { useCountdown } from './use-countdown';
import { useDwellTime } from './use-dwell-time';
import { useQuestionHotkeys } from './use-hotkeys';

/** Server codes meaning the attempt can no longer take answers: show the result instead. */
const CLOSED_CODES = new Set(['ATTEMPT_EXPIRED', 'ATTEMPT_CLOSED']);

/** One server deadline for the whole attempt; every answer is saved online right away. */
export function LegacyAttemptScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: attempt, error, isPending, refetch, dataUpdatedAt } = useAttempt(id);
  const { mutate: saveAnswer, error: saveError } = useSaveAnswer(id);
  const { mutate: submit, isPending: isSubmitting, error: submitError } = useSubmitAttempt(id);
  const [index, setIndex] = useState(0);
  const autoSubmitted = useRef(false);

  const shownQuestionId =
    attempt?.questions[Math.min(index, attempt.questions.length - 1)]?.id ?? null;
  const takeDwell = useDwellTime(shownQuestionId);

  const offset = attempt ? clockOffsetMs(attempt.serverTime, dataUpdatedAt) : 0;
  const secondsLeft = useCountdown(attempt?.expiresAt ?? null, offset);
  const status = attempt?.status;

  const showResult = () => void navigate(`/attempts/${id}/result`, { replace: true });

  // Submitted or expired elsewhere (another device, or the server closed it): show the result.
  useEffect(() => {
    if (status !== undefined && status !== 'IN_PROGRESS') showResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the status changes only
  }, [status]);

  // Time is up: submit what was saved. The server accepts it as the attempt's final state.
  useEffect(() => {
    if (secondsLeft !== 0 || status !== 'IN_PROGRESS' || autoSubmitted.current) return;
    autoSubmitted.current = true;
    submit(undefined, { onSettled: showResult });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when the timer hits zero
  }, [secondsLeft]);

  const questions = attempt?.questions ?? [];
  const current = questions[Math.min(index, questions.length - 1)];
  const isLast = index >= questions.length - 1;

  const change = (patch: { response?: unknown; flagged?: boolean; timeSpentMs?: number }) => {
    if (!current) return;
    saveAnswer(
      { attemptQuestionId: current.id, ...patch },
      {
        onError: (err) => {
          if (CLOSED_CODES.has(toApiError(err).serverCode ?? '')) void refetch();
        },
      },
    );
  };

  useQuestionHotkeys(
    {
      prev: () => setIndex((i) => Math.max(0, i - 1)),
      next: () => setIndex((i) => Math.min(questions.length - 1, i + 1)),
      flag: () => change({ flagged: !current?.flagged }),
      note: toggleNoteMode,
      escape: exitNoteMode,
    },
    current !== undefined,
  );

  if (isPending) {
    return (
      <FocusPage>
        <LoadingView />
      </FocusPage>
    );
  }
  if (!attempt || !current) {
    return (
      <FocusPage>
        <ErrorView error={error} onRetry={refetch} />
      </FocusPage>
    );
  }

  const confirmSubmit = async () => {
    const unanswered = attempt.totalQuestions - attempt.answeredCount;
    const ok = await confirm({
      title: t('attempt.confirmTitle'),
      message:
        unanswered > 0
          ? t('attempt.confirmUnanswered', { count: unanswered })
          : t('attempt.confirmAll'),
      cancelLabel: t('attempt.keepGoing'),
      confirmLabel: t('attempt.submit'),
    });
    if (ok) submit(undefined, { onSuccess: showResult });
  };

  const actionError = submitError ?? saveError;

  return (
    <VocabScope sourceTitle={attempt.examTitle}>
      <FocusPage>
        <TopBar
          title={attempt.examTitle}
          fallback={`/exams/${attempt.examId}`}
          accessory={
            <div className="flex items-center gap-2">
              <NoteToggle />
              {secondsLeft === null ? null : <TimerBadge ms={secondsLeft * 1000} />}
            </div>
          }
        />
        <NoteModeBanner />
        <QuestionProgress
          index={index}
          count={questions.length}
          answered={attempt.answeredCount}
        />
        <QuestionStrip
          items={questions.map((question) => ({
            id: question.id,
            isAnswered: question.response != null,
            isFlagged: question.flagged,
          }))}
          currentIndex={index}
          onSelect={setIndex}
        />

        <QuestionBody
          key={current.id}
          question={current}
          onAnswer={(answer) => change({ response: answer, timeSpentMs: takeDwell() })}
        />

        {actionError ? (
          <p className="pb-2 text-sm text-destructive">{describeError(actionError, t)}</p>
        ) : null}
        <ActionBar>
          <PrevButton disabled={index === 0} onClick={() => setIndex(index - 1)} />
          <FlagButton
            flagged={current.flagged}
            onClick={() => change({ flagged: !current.flagged })}
          />
          {isLast ? (
            <Button
              variant="brand"
              size="lg"
              className="flex-1"
              disabled={isSubmitting}
              onClick={() => void confirmSubmit()}
            >
              {isSubmitting ? <Spinner className="text-on-brand" /> : <Send />}
              {t('attempt.submit')}
            </Button>
          ) : (
            <Button
              variant="brand"
              size="lg"
              className="flex-1"
              onClick={() => setIndex(index + 1)}
              title={`${t('attempt.next')} (→)`}
            >
              {t('attempt.next')}
              <ArrowRight />
            </Button>
          )}
        </ActionBar>
      </FocusPage>
    </VocabScope>
  );
}

function QuestionBody({
  question,
  onAnswer,
}: {
  question: AttemptQuestion;
  onAnswer: (answer: Answer | null) => void;
}) {
  const { t } = useTranslation();
  const label = useQuestionLabel();
  const input = parseInput(question.type, question.data);
  const answer = parseAnswer(question.type, question.response);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="flex flex-col gap-3 pt-1 pb-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <QuestionTags label={label(question.sectionTitle, question.sourceNumber, question.order)} />
          <span className="text-xs font-medium text-muted-foreground">
            {t('attempt.points', { count: question.points })}
          </span>
        </div>
        <QuestionStem caseStudy={question.caseStudy} content={question.content} media={question.media} />
      </Card>
      {input ? (
        <AnswerView input={input} answer={answer} onChange={onAnswer} />
      ) : (
        <p className="text-sm text-warning-soft-foreground">{t('attempt.unsupported')}</p>
      )}
    </div>
  );
}
