import { CheckCheck, Coffee, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAnswered } from '@/attempt-engine/metrics';
import { sectionQuestionIds } from '@/attempt-engine/reducer';
import type { SessionState } from '@/attempt-engine/types';
import { FeatureIcon } from '@/components/app/icon-tile';
import { ProgressRing } from '@/components/app/progress-ring';
import { ActionBar } from '@/components/app/top-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { dispatchAttempt } from '@/stores/attempt-sessions';
import { formatClockMs } from '@/utils/format-duration';

const isVisible = () => document.visibilityState === 'visible';

/**
 * Between two sections: offer the break (or skip it), count it down, then start the next section.
 * The break runs on the wall clock: it is rest, not test time. When it ends while the user is here,
 * the next section starts by itself; when the user was away, it waits for them to click "start".
 */
export function BreakScreen({
  state,
  sectionTitle,
}: {
  state: SessionState;
  sectionTitle: (order: number) => string;
}) {
  const { t } = useTranslation();
  const previous = state.sections.findLast((s) => s.status === 'COMPLETED');
  const next = state.sections.find((s) => s.status === 'LOCKED');
  if (!previous || !next) return null;

  const id = state.attemptId;
  const nextTitle = sectionTitle(next.order);
  const startNext = () => dispatchAttempt(id, { type: 'SECTION_START', sectionOrder: next.order });
  const canBreak =
    state.breakMinutes !== null && previous.breakTakenMs === null && !previous.breakSkipped;
  const done = sectionQuestionIds(state, previous.order);
  const answered = done.filter((qid) => isAnswered(state.questions[qid])).length;

  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-6 py-8">
        <div className="flex flex-col items-center gap-3">
          <FeatureIcon icon={state.phase === 'ON_BREAK' ? Coffee : CheckCheck} />
          <h2 className="text-center text-2xl font-bold">
            {state.phase === 'ON_BREAK'
              ? t('sectioned.onBreak')
              : t('sectioned.sectionDone', { title: sectionTitle(previous.order) })}
          </h2>
        </div>
        <Card className="mx-auto flex w-full max-w-md items-center gap-4">
          <ProgressRing
            percent={done.length > 0 ? Math.round((answered / done.length) * 100) : 0}
            size={56}
            thickness={6}
          >
            <span className="text-xs font-semibold">{`${answered}/${done.length}`}</span>
          </ProgressRing>
          <div className="flex-1">
            <p className="text-sm">
              {t('sectioned.doneSummary', {
                answered,
                total: done.length,
                time: formatClockMs(previous.usedMs) ?? '',
              })}
            </p>
            {previous.endReason === 'TIME_UP' ? (
              <p className="text-sm text-warning-soft-foreground">{t('sectioned.timeUp')}</p>
            ) : null}
          </div>
        </Card>
        {state.phase === 'ON_BREAK' ? (
          <BreakCountdown
            attemptId={id}
            // BREAK_START always sets it; ON_BREAK is never rebuilt from the server copy.
            startedAt={previous.breakStartedAt ?? 0}
            durationMs={(state.breakMinutes ?? 0) * 60_000}
            nextOrder={next.order}
          />
        ) : (
          <p className="mx-auto max-w-md text-center leading-relaxed">
            {canBreak
              ? t('sectioned.breakOffer', { count: state.breakMinutes ?? 0, title: nextTitle })
              : t('sectioned.nextReady', { title: nextTitle })}
          </p>
        )}
      </div>
      <ActionBar direction="column">
        {state.phase === 'ON_BREAK' ? (
          <Button
            variant="brand"
            size="lg"
            onClick={() => {
              dispatchAttempt(id, { type: 'BREAK_END' });
              startNext();
            }}
          >
            <Play className="fill-current" />
            {t('sectioned.endBreakNow', { title: nextTitle })}
          </Button>
        ) : canBreak ? (
          <>
            <Button
              variant="brand"
              size="lg"
              onClick={() => dispatchAttempt(id, { type: 'BREAK_START' })}
            >
              <Coffee />
              {t('sectioned.takeBreak', { count: state.breakMinutes ?? 0 })}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                dispatchAttempt(id, { type: 'BREAK_SKIP' });
                startNext();
              }}
            >
              {t('sectioned.skipBreak', { title: nextTitle })}
            </Button>
          </>
        ) : (
          <Button variant="brand" size="lg" onClick={startNext}>
            <Play className="fill-current" />
            {t('sectioned.startSection', { title: nextTitle })}
          </Button>
        )}
      </ActionBar>
    </>
  );
}

function BreakCountdown({
  attemptId,
  startedAt,
  durationMs,
  nextOrder,
}: {
  attemptId: string;
  startedAt: number;
  durationMs: number;
  nextOrder: number;
}) {
  const { t } = useTranslation();
  const leftAt = () => Math.max(0, durationMs - (Date.now() - startedAt));
  const [left, setLeft] = useState(leftAt);
  // Did the user see the break running? Only then may its end start the next section.
  const watched = useRef(left > 0 && isVisible());

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      setLeft(remaining);
      if (remaining > 0) {
        watched.current = isVisible();
        return;
      }
      clearInterval(timer);
      dispatchAttempt(attemptId, { type: 'BREAK_END' });
      if (watched.current && isVisible()) {
        dispatchAttempt(attemptId, { type: 'SECTION_START', sectionOrder: nextOrder });
      }
    }, 500);
    // Timers are throttled in background tabs: forget "watched" as soon as the tab is hidden.
    const onVisibility = () => {
      if (!isVisible()) watched.current = false;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [attemptId, startedAt, durationMs, nextOrder]);

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-sm text-muted-foreground">{t('sectioned.breakLeft')}</p>
      <p className="text-5xl font-bold text-primary tabular-nums">{formatClockMs(left) ?? ''}</p>
    </div>
  );
}
