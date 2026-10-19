import { CheckCheck, Flag, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAnswered } from '@/attempt-engine/metrics';
import { activeSection } from '@/attempt-engine/reducer';
import type { SessionState } from '@/attempt-engine/types';
import { confirm } from '@/components/app/confirm';
import { SegmentedControl } from '@/components/app/segmented-control';
import { ActionBar } from '@/components/app/top-bar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type AttemptSnapshot, dispatchAttempt } from '@/stores/attempt-sessions';

type Filter = 'ALL' | 'FLAGGED' | 'UNANSWERED';

/**
 * End of a section: every question at a glance, flagged ones first in mind. The clock keeps
 * running; the user goes back to any question of this section, or ends it (for good).
 */
export function SectionReview({
  state,
  snapshot,
  sectionTitle,
}: {
  state: SessionState;
  snapshot: AttemptSnapshot;
  sectionTitle: (order: number) => string;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('ALL');
  const section = activeSection(state);
  if (!section) return null;

  const items = snapshot.questions
    .filter((q) => q.sectionOrder === section.order)
    .map((q, index) => ({
      id: q.id,
      number: index + 1,
      answered: isAnswered(state.questions[q.id]),
      flagged: state.questions[q.id]?.flagged ?? false,
    }));
  const flaggedCount = items.filter((i) => i.flagged).length;
  const unansweredCount = items.filter((i) => !i.answered).length;
  const shown = items.filter((i) =>
    filter === 'FLAGGED' ? i.flagged : filter === 'UNANSWERED' ? !i.answered : true,
  );
  const hasNext = state.sections.some((s) => s.status === 'LOCKED');

  const open = (questionId: string) =>
    dispatchAttempt(state.attemptId, { type: 'QUESTION_VIEW', attemptQuestionId: questionId });

  const confirmEnd = async () => {
    const ok = await confirm({
      title: t('sectioned.endTitle', { title: sectionTitle(section.order) }),
      message: [
        unansweredCount > 0 ? t('sectioned.endUnanswered', { count: unansweredCount }) : null,
        flaggedCount > 0 ? t('sectioned.endFlagged', { count: flaggedCount }) : null,
        hasNext ? t('sectioned.endLocked') : t('sectioned.endSubmits'),
      ]
        .filter(Boolean)
        .join('\n'),
      cancelLabel: t('attempt.keepGoing'),
      confirmLabel: hasNext ? t('sectioned.endSection') : t('attempt.submit'),
      destructive: true,
    });
    if (ok) {
      dispatchAttempt(state.attemptId, { type: 'SECTION_END', payload: { reason: 'USER' } });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 pt-4">
        <h2 className="text-xl font-semibold">
          {t('sectioned.reviewTitle', { title: sectionTitle(section.order) })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('sectioned.reviewSummary', {
            answered: items.length - unansweredCount,
            total: items.length,
            flagged: flaggedCount,
          })}
        </p>
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'ALL', label: t('sectioned.filterAll') },
            { value: 'FLAGGED', label: t('sectioned.filterFlagged', { count: flaggedCount }) },
            {
              value: 'UNANSWERED',
              label: t('sectioned.filterUnanswered', { count: unansweredCount }),
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-5 gap-3 py-4 sm:grid-cols-8 md:grid-cols-10">
        {shown.length === 0 ? (
          <p className="col-span-full p-6 text-center text-muted-foreground">
            {t('sectioned.reviewEmpty')}
          </p>
        ) : null}
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => open(item.id)}
            className={cn(
              'relative flex aspect-square items-center justify-center rounded-2xl border font-semibold transition hover:scale-105',
              item.flagged
                ? 'border-warning bg-warning-soft text-warning-soft-foreground'
                : item.answered
                  ? 'border-transparent bg-primary-soft text-primary-soft-foreground'
                  : 'bg-card text-muted-foreground',
            )}
          >
            {item.number}
            {item.flagged ? (
              <Flag className="absolute top-1 right-1 size-3 fill-current text-warning" />
            ) : null}
          </button>
        ))}
      </div>
      <ActionBar>
        <Button variant="brand" size="lg" className="flex-1" onClick={() => void confirmEnd()}>
          {hasNext ? <CheckCheck /> : <Send />}
          {hasNext
            ? t('sectioned.endSectionNamed', { title: sectionTitle(section.order) })
            : t('attempt.submit')}
        </Button>
      </ActionBar>
    </>
  );
}
