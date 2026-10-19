import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { getSession, withSession } from '@/stores/attempt-sessions';

/** How often the clock is read (it is computed, not counted down, so this never drifts). */
const TICK_MS = 250;

const pauseAndSave = (attemptId: string) =>
  withSession(attemptId, (s) => {
    s.pause();
    s.checkpoint();
  });

/**
 * Keeps the section clock honest while the test page is open:
 * - ticks: ends the section when time is up, checkpoints the clock every second;
 * - pauses (and saves) when the tab is hidden, the page is closed or the screen unmounts. Coming
 *   back does NOT resume by itself: the user clicks "continue" on the pause screen.
 * - while the clock runs, closing the tab asks for confirmation first.
 */
export function useSectionClockLifecycle(attemptId: string) {
  useEffect(() => {
    const timer = setInterval(() => withSession(attemptId, (s) => s.tick()), TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') pauseAndSave(attemptId);
    };
    const onPageHide = () => pauseAndSave(attemptId);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (getSession(attemptId)?.isRunning) event.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      pauseAndSave(attemptId);
    };
  }, [attemptId]);
}

/** Thresholds where the timer turns to a warning and a toast says how long is left. */
const WARN_AT_MS = [5 * 60_000, 60_000];

/** Time left in the running section, re-read 4 times a second (for the timer badge only). */
export function useRemainingMs(attemptId: string): number | null {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(() => getSession(attemptId)?.remainingMs() ?? null);
  const warned = useRef(new Set<number>());

  useEffect(() => {
    const timer = setInterval(() => {
      const next = getSession(attemptId)?.remainingMs() ?? null;
      setRemaining(next === null ? null : Math.ceil(next / 1000) * 1000);
      for (const at of WARN_AT_MS) {
        if (next !== null && next <= at && next > at - 2_000 && !warned.current.has(at)) {
          warned.current.add(at);
          toast.warning(t('sectioned.timeWarning', { count: at / 60_000 }));
        }
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [attemptId, t]);

  return remaining;
}
