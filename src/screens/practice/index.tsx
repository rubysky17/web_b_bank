import { ArrowRight, CheckCheck, CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { type BankFilters, type BankQuestion, useBankQuestions } from '@/api/question-bank';
import { GradientProgress } from '@/components/app/brand';
import { confirm } from '@/components/app/confirm';
import { ErrorView, LoadingView } from '@/components/app/states';
import { ActionBar, TopBar } from '@/components/app/top-bar';
import { FocusPage } from '@/components/layout/app-shell';
import {
  type Answer,
  AnswerView,
  Explanation,
  fromDefinition,
  isAnswerComplete,
  isAnswerCorrect,
  QuestionStem,
  QuestionTags,
} from '@/components/question';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NoteModeBanner, NoteToggle } from '@/components/vocab/note-toggle';
import { VocabScope } from '@/components/vocab/vocab-scope';
import { exitNoteMode, toggleNoteMode } from '@/components/vocab/vocab-ui-store';
import { cn } from '@/lib/utils';
import { PrevButton } from '@/screens/attempt/parts';
import { useQuestionHotkeys } from '@/screens/attempt/use-hotkeys';
import { fromParams } from '@/screens/bank/filters';
import {
  checkPracticeAnswer,
  resetPractice,
  savePracticeAnswer,
  useUserStateStore,
} from '@/stores/user-state-store';
import { practiceOf } from '@/user-state/practice';
import { optionLetter } from '@/utils/format-duration';

/** Load the next page this many questions before the end of what is loaded. */
const PREFETCH_AHEAD = 5;

export function PracticeRoute() {
  const [searchParams] = useSearchParams();
  const { filters, start } = fromParams(Object.fromEntries(searchParams));
  // New filters or start (e.g. a link onto an open screen) start a fresh session.
  return (
    <PracticeScreen key={JSON.stringify({ filters, start })} filters={filters} start={start} />
  );
}

/**
 * Self-study over the question bank: answer, check right away, read the explanation. Answers are
 * kept in the browser and synced to the user's other devices (`stores/user-state-store.ts`).
 */
function PracticeScreen({ filters, start }: { filters: BankFilters; start: number }) {
  const { t } = useTranslation();
  const { data, error, isPending, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useBankQuestions(filters);
  const [index, setIndex] = useState(start);
  const items = useUserStateStore((s) => s.items);
  const loaded = data?.items.length ?? 0;
  const total = data?.total ?? 0;
  const isLast = index >= total - 1;

  // The list may have shown only the first pages: keep loading ahead of the reader.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && index >= loaded - PREFETCH_AHEAD) {
      void fetchNextPage();
    }
  }, [index, loaded, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  useQuestionHotkeys({
    prev: () => setIndex((i) => Math.max(0, i - 1)),
    next: () => setIndex((i) => (i + 1 < loaded && i + 1 < total ? i + 1 : i)),
    note: toggleNoteMode,
    escape: exitNoteMode,
  });

  if (isPending) {
    return (
      <FocusPage>
        <LoadingView />
      </FocusPage>
    );
  }
  const question = data?.items[Math.min(index, loaded - 1)];
  if (!data || !question) {
    return (
      <FocusPage>
        <ErrorView error={error} onRetry={refetch} />
      </FocusPage>
    );
  }

  const practiced = data.items.flatMap((q) => {
    const done = practiceOf<Answer>(items, q.id);
    return done ? [{ question: q, ...done }] : [];
  });
  const results = practiced.flatMap(({ question: q, response, checked }) => {
    if (!checked) return [];
    const model = fromDefinition(q.type, q.definition);
    return model ? [isAnswerCorrect(model.key, response)] : [];
  });
  const correctCount = results.filter(Boolean).length;
  const current = practiceOf<Answer>(items, question.id);

  const confirmReset = async () => {
    const ok = await confirm({
      title: t('practice.resetTitle'),
      message: t('practice.resetMessage', { count: practiced.length }),
      confirmLabel: t('practice.reset'),
      destructive: true,
    });
    if (ok) resetPractice(practiced.map(({ question: q }) => q.id));
  };

  return (
    // Notes are tagged with the exam the question comes from.
    <VocabScope sourceTitle={question.examTitle || t('vocab.practiceSource')}>
      <FocusPage>
        <TopBar
          title={t('practice.progress', { current: index + 1, total: data.total })}
          subtitle={t('practice.title')}
          fallback="/bank"
          accessory={
            <div className="flex items-center gap-2">
              {practiced.length > 0 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void confirmReset()}
                  aria-label={t('practice.reset')}
                  title={t('practice.reset')}
                >
                  <RotateCcw />
                </Button>
              ) : null}
              <NoteToggle />
              <span className="flex items-center gap-1 rounded-full bg-success-soft px-3 py-2 text-sm font-semibold text-success-soft-foreground">
                <CircleCheck className="size-3.5" />
                {t('practice.score', { correct: correctCount, answered: results.length })}
              </span>
            </div>
          }
        />
        <NoteModeBanner />
        <GradientProgress
          className="mt-3"
          percent={Math.round(((index + 1) / Math.max(data.total, 1)) * 100)}
        />
        <div className="pt-3 pb-4">
          <PracticeQuestion
            key={question.id}
            question={question}
            answer={current?.response ?? null}
            isChecked={current?.checked === true}
            onAnswer={(answer, checkNow) => savePracticeAnswer(question.id, answer, checkNow)}
            onCheck={() => checkPracticeAnswer(question.id)}
          />
        </div>
        {isLast && current?.checked ? (
          <p className="pb-2 text-center text-sm text-muted-foreground">{t('practice.finished')}</p>
        ) : null}
        <ActionBar>
          <PrevButton disabled={index === 0} onClick={() => setIndex(index - 1)} />
          <Button
            variant="brand"
            size="lg"
            className="flex-1"
            disabled={isLast || index + 1 >= loaded}
            onClick={() => setIndex(index + 1)}
            title={`${t('practice.next')} (→)`}
          >
            {t('practice.next')}
            <ArrowRight />
          </Button>
        </ActionBar>
      </FocusPage>
    </VocabScope>
  );
}

function PracticeQuestion({
  question,
  answer,
  isChecked,
  onAnswer,
  onCheck,
}: {
  question: BankQuestion;
  answer: Answer | null;
  isChecked: boolean;
  /** `checkNow`: single choice is checked on the first click. */
  onAnswer: (answer: Answer | null, checkNow: boolean) => void;
  onCheck: () => void;
}) {
  const { t } = useTranslation();
  const model = fromDefinition(question.type, question.definition);
  if (!model) {
    return <p className="text-sm text-warning-soft-foreground">{t('attempt.unsupported')}</p>;
  }
  const { input, key } = model;
  const isRight = isChecked && isAnswerCorrect(key, answer);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <QuestionTags
          label={`${question.examTitle} · ${question.sectionTitle} · ${t('question.number', {
            n: question.sourceNumber ?? question.order,
          })}`}
          domain={question.domain?.name}
          difficulty={question.difficulty}
        />
        <QuestionStem
          caseStudy={question.caseStudy}
          content={question.content}
          media={question.media}
        />
      </Card>
      <AnswerView
        input={input}
        answer={answer}
        onChange={(next) => onAnswer(next, input.type === 'SINGLE_CHOICE')}
        solution={isChecked ? key : null}
      />
      {isChecked ? (
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl p-4 font-semibold duration-300 animate-in fade-in slide-in-from-bottom-1',
            isRight
              ? 'bg-success-soft text-success-soft-foreground'
              : 'bg-destructive-soft text-destructive-soft-foreground',
          )}
        >
          {isRight ? (
            <CircleCheck className="size-[22px] text-success" />
          ) : (
            <CircleX className="size-[22px] text-destructive" />
          )}
          <span className="flex-1">
            {isRight
              ? t('practice.correct')
              : input.type === 'DRAG_DROP'
                ? t('practice.wrongMatch')
                : t('practice.wrong', { letter: correctLabel(model) })}
          </span>
        </div>
      ) : input.type === 'SINGLE_CHOICE' ? null : (
        <Button
          variant="brand"
          size="lg"
          disabled={!isAnswerComplete(input, answer)}
          onClick={onCheck}
        >
          <CheckCheck />
          {t('practice.check')}
        </Button>
      )}
      {isChecked ? <Explanation explanation={question.explanation} media={question.media} /> : null}
    </div>
  );
}

/** "C" or "A, D" for choice questions. */
function correctLabel({ input, key }: NonNullable<ReturnType<typeof fromDefinition>>): string {
  if (input.type === 'DRAG_DROP' || key.type === 'DRAG_DROP') return '';
  const ids = key.type === 'SINGLE_CHOICE' ? [key.correctOptionId] : key.correctOptionIds;
  return input.options
    .flatMap((option, i) => (ids.includes(option.id) ? [optionLetter(i)] : []))
    .join(', ');
}
