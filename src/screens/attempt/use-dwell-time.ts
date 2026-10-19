import { useEffect, useRef } from 'react';

import { type DwellState, pause, resume, startDwell, switchQuestion, take } from './dwell-tracker';

const isVisible = () => document.visibilityState === 'visible';

/**
 * Measures visible time on the shown question. Returns `takeDwell()`, to call when the user picks
 * an answer: it gives the ms to send with that pick and restarts the count. Call it from event
 * handlers only (it reads a ref).
 */
export function useDwellTime(questionId: string | null) {
  const state = useRef<DwellState | null>(null);

  useEffect(() => {
    const now = Date.now();
    state.current = state.current
      ? switchQuestion(state.current, questionId, now)
      : startDwell(questionId, now, isVisible());
  }, [questionId]);

  useEffect(() => {
    const onChange = () => {
      if (!state.current) return;
      const now = Date.now();
      state.current = isVisible() ? resume(state.current, now) : pause(state.current, now);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return () => {
    if (!state.current) return undefined;
    const { ms, next } = take(state.current, Date.now());
    state.current = next;
    return ms;
  };
}
