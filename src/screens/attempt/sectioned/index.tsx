import { Pause } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { activeSection } from '@/attempt-engine/reducer';
import { LoadingView } from '@/components/app/states';
import { TopBar } from '@/components/app/top-bar';
import { FocusPage } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  dispatchAttempt,
  getSession,
  loadSnapshot,
  useSessionState,
  withSession,
} from '@/stores/attempt-sessions';

import { TimerBadge } from '../parts';
import { BreakScreen } from './break-screen';
import { FinishScreen } from './finish-screen';
import { PauseOverlay } from './pause-overlay';
import { QuestionScreen } from './question-screen';
import { SectionIntro } from './section-intro';
import { SectionReview } from './section-review';
import { useRemainingMs, useSectionClockLifecycle } from './use-section-clock';

/**
 * A sectioned attempt, played entirely in the browser: [section → optional break] × n. Every
 * action is recorded as an event and uploaded in the background (see `src/api/attempt-sync.ts`).
 */
export function SectionedAttemptScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const [snapshot] = useState(() => {
    getSession(id);
    return loadSnapshot(id);
  });
  const state = useSessionState(id);
  useSectionClockLifecycle(id);

  const phase = state?.phase;
  // The last section ended (by the user or the clock): hand the attempt in.
  useEffect(() => {
    if (phase === 'FINISHED' && state?.closing === null) {
      dispatchAttempt(id, { type: 'ATTEMPT_SUBMIT' });
    }
  }, [id, phase, state?.closing]);

  // Handed in, or already uploaded and forgotten by the device (same element, so it stays mounted
  // while the session disappears): FinishScreen uploads it and navigates away.
  if (!state || !snapshot || state.closing !== null) {
    return <FinishScreen id={id} closing={state?.closing ?? 'SUBMIT'} />;
  }

  const working = state.phase === 'IN_SECTION' || state.phase === 'IN_REVIEW';
  const isRunning = getSession(id)?.isRunning ?? false;
  const section = activeSection(state);
  const sectionTitle = (order: number) =>
    snapshot.sections.find((s) => s.order === order)?.title ?? t('sectioned.section', { order });

  let body;
  if (state.phase === 'NOT_STARTED') {
    body = <SectionIntro state={state} sectionTitle={sectionTitle} />;
  } else if (state.phase === 'BREAK_OFFER' || state.phase === 'ON_BREAK') {
    body = <BreakScreen state={state} sectionTitle={sectionTitle} />;
  } else if (state.phase === 'IN_REVIEW') {
    body = <SectionReview state={state} snapshot={snapshot} sectionTitle={sectionTitle} />;
  } else if (state.phase === 'IN_SECTION') {
    body = <QuestionScreen state={state} snapshot={snapshot} />;
  } else {
    body = <LoadingView />;
  }

  return (
    <FocusPage>
      <TopBar
        title={working && section ? sectionTitle(section.order) : state.examTitle}
        subtitle={working ? state.examTitle : undefined}
        fallback={`/exams/${state.examId}`}
        accessory={
          working ? (
            <HeaderClock
              attemptId={id}
              isRunning={isRunning}
              onPause={() => withSession(id, (s) => s.pause())}
            />
          ) : null
        }
      />
      {body}
      {working && !isRunning ? (
        <PauseOverlay
          attemptId={id}
          examId={state.examId}
          sectionTitle={section ? sectionTitle(section.order) : ''}
          onResume={() => withSession(id, (s) => s.resume())}
        />
      ) : null}
    </FocusPage>
  );
}

function HeaderClock({
  attemptId,
  isRunning,
  onPause,
}: {
  attemptId: string;
  isRunning: boolean;
  onPause: () => void;
}) {
  const { t } = useTranslation();
  const remaining = useRemainingMs(attemptId);
  return (
    <div className="flex items-center gap-2">
      <TimerBadge ms={remaining} />
      {isRunning ? (
        <Button
          variant="outline"
          size="icon"
          onClick={onPause}
          aria-label={t('sectioned.pause')}
          title={t('sectioned.pause')}
        >
          <Pause className="size-5" />
        </Button>
      ) : null}
    </div>
  );
}
