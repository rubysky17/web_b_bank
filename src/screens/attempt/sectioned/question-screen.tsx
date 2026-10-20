import { ArrowRight, List } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { isAnswered } from '@/attempt-engine/metrics';
import { activeSection } from '@/attempt-engine/reducer';
import type { Confidence, SessionState } from '@/attempt-engine/types';
import { ActionBar } from '@/components/app/top-bar';
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
import { exitNoteMode, toggleNoteMode } from '@/components/vocab/vocab-ui-store';
import { cn } from '@/lib/utils';
import { type AttemptSnapshot, dispatchAttempt, getSession } from '@/stores/attempt-sessions';

import { FlagButton, PrevButton, QuestionProgress, QuestionStrip } from '../parts';
import { useQuestionHotkeys } from '../use-hotkeys';

/** The running section, one question at a time. Only this section's questions can be reached. */
export function QuestionScreen({
  state,
  snapshot,
}: {
  state: SessionState;
  snapshot: AttemptSnapshot;
}) {
  const { t } = useTranslation();
  const section = activeSection(state);
  const questions = snapshot.questions.filter((q) => q.sectionOrder === section?.order);
  const index = Math.max(
    0,
    questions.findIndex((q) => q.id === state.currentQuestionId),
  );
  const current = questions[index];
  const attemptId = state.attemptId;
  const currentId = state.currentQuestionId;

  // Entering the section (or coming back from the review): put a question on screen.
  useEffect(() => {
    if (currentId === null && current) {
      dispatchAttempt(attemptId, { type: 'QUESTION_VIEW', attemptQuestionId: current.id });
    }
  }, [attemptId, currentId, current]);

  const go = (to: number) => {
    const target = questions[to];
    if (target) dispatchAttempt(attemptId, { type: 'QUESTION_VIEW', attemptQuestionId: target.id });
  };
  const trace = current ? state.questions[current.id] : undefined;
  const flagged = trace?.flagged ?? false;
  const toggleFlag = () => {
    if (!current) return;
    dispatchAttempt(attemptId, {
      type: 'FLAG_SET',
      attemptQuestionId: current.id,
      payload: { flagged: !flagged },
    });
  };

  // Not while paused: the overlay hides the question so a pause can't be used to read ahead.
  useQuestionHotkeys(
    {
      prev: () => go(index - 1),
      next: () => go(index + 1),
      flag: toggleFlag,
      note: toggleNoteMode,
      escape: exitNoteMode,
    },
    getSession(attemptId)?.isRunning ?? false,
  );

  if (!section || !current) return null;
  const isLast = index >= questions.length - 1;
  const answeredCount = questions.filter((q) => isAnswered(state.questions[q.id])).length;

  return (
    <>
      <QuestionProgress index={index} count={questions.length} answered={answeredCount} />
      <QuestionStrip
        items={questions.map((q) => ({
          id: q.id,
          isAnswered: isAnswered(state.questions[q.id]),
          isFlagged: state.questions[q.id]?.flagged ?? false,
        }))}
        currentIndex={index}
        onSelect={go}
      />

      <QuestionBody
        key={current.id}
        attemptId={attemptId}
        question={current}
        response={trace?.response ?? null}
        eliminated={trace?.eliminated ?? []}
        confidence={trace?.confidence ?? null}
      />

      <ActionBar>
        <PrevButton disabled={index === 0} onClick={() => go(index - 1)} />
        <FlagButton flagged={flagged} onClick={toggleFlag} />
        {isLast ? (
          <Button
            variant="brand"
            size="lg"
            className="flex-1"
            onClick={() => dispatchAttempt(attemptId, { type: 'SECTION_REVIEW_OPEN' })}
          >
            <List />
            {t('sectioned.reviewSection')}
          </Button>
        ) : (
          <Button
            variant="brand"
            size="lg"
            className="flex-1"
            onClick={() => go(index + 1)}
            title={`${t('attempt.next')} (→)`}
          >
            {t('attempt.next')}
            <ArrowRight />
          </Button>
        )}
      </ActionBar>
    </>
  );
}

function QuestionBody({
  attemptId,
  question,
  response,
  eliminated,
  confidence,
}: {
  attemptId: string;
  question: AttemptSnapshot['questions'][number];
  response: unknown;
  eliminated: string[];
  confidence: Confidence | null;
}) {
  const { t } = useTranslation();
  const label = useQuestionLabel();
  const input = parseInput(question.type, question.data);
  const answer = parseAnswer(question.type, response);
  const record = (type: Parameters<typeof dispatchAttempt>[1]['type'], payload?: object) =>
    dispatchAttempt(attemptId, {
      type,
      attemptQuestionId: question.id,
      payload: payload as Record<string, unknown> | undefined,
    });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const picked = (a: Answer | null) =>
    a === null ? [] : 'optionId' in a ? [a.optionId] : 'optionIds' in a ? a.optionIds : [];

  const onAnswer = (next: Answer | null) => {
    if (next === null) {
      record('ANSWER_CLEAR');
      return;
    }
    // Picking a crossed-out option brings it back first.
    for (const optionId of picked(next)) {
      if (eliminated.includes(optionId)) record('OPTION_RESTORE', { optionId });
    }
    record('ANSWER_SELECT', { response: next });
  };

  const onEliminate = (optionId: string, eliminate: boolean) => {
    if (eliminate && picked(answer).includes(optionId)) {
      // Crossing out the picked option takes it out of the answer.
      const rest = picked(answer).filter((id) => id !== optionId);
      if (answer && 'optionIds' in answer && rest.length > 0) {
        record('ANSWER_SELECT', { response: { optionIds: rest } });
      } else {
        record('ANSWER_CLEAR');
      }
    }
    record(eliminate ? 'OPTION_ELIMINATE' : 'OPTION_RESTORE', { optionId });
  };

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
        <AnswerView
          input={input}
          answer={answer}
          onChange={onAnswer}
          eliminated={eliminated}
          onEliminate={input.type === 'DRAG_DROP' ? undefined : onEliminate}
        />
      ) : (
        <p className="text-sm text-warning-soft-foreground">{t('attempt.unsupported')}</p>
      )}
      {answer ? (
        <ConfidencePicker value={confidence} onChange={(level) => record('CONFIDENCE_SET', { level })} />
      ) : null}
    </div>
  );
}

const LEVELS: readonly Confidence[] = ['LOW', 'MEDIUM', 'HIGH'];

// Literal class names so Tailwind generates them.
const SELECTED = {
  LOW: 'bg-warning-soft text-warning-soft-foreground',
  MEDIUM: 'bg-primary-soft text-primary-soft-foreground',
  HIGH: 'bg-success-soft text-success-soft-foreground',
} as const satisfies Record<Confidence, string>;

/** "How sure are you?": separates real knowledge from lucky guesses in the reports. */
function ConfidencePicker({
  value,
  onChange,
}: {
  value: Confidence | null;
  /** Clicking the chosen level again clears it (confidence is optional). */
  onChange: (level: Confidence | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">
        {t('sectioned.confidenceQuestion')}
      </p>
      <div className="flex gap-2" role="radiogroup">
        {LEVELS.map((level) => {
          const isSelected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(isSelected ? null : level)}
              className={cn(
                'h-10 flex-1 truncate rounded-full px-2 text-sm font-semibold transition',
                isSelected ? SELECTED[level] : 'bg-secondary hover:bg-accent',
              )}
            >
              {t(`confidence.${level}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
