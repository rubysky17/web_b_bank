import { applyAnswerChange, clockOffsetMs, secondsLeft } from './attempt-state';

const view = {
  answeredCount: 1,
  flaggedCount: 0,
  questions: [
    { id: 'q1', response: { optionId: 'a' }, flagged: false },
    { id: 'q2', response: null, flagged: false },
  ],
};

describe('applyAnswerChange', () => {
  it('sets an answer and recounts', () => {
    const next = applyAnswerChange(view, { attemptQuestionId: 'q2', response: { optionId: 'b' } });
    expect(next.questions[1]).toEqual({ id: 'q2', response: { optionId: 'b' }, flagged: false });
    expect(next.answeredCount).toBe(2);
  });

  it('clears an answer with null and keeps fields that were not sent', () => {
    const next = applyAnswerChange(view, { attemptQuestionId: 'q1', response: null });
    expect(next.questions[0]).toEqual({ id: 'q1', response: null, flagged: false });
    expect(next.answeredCount).toBe(0);
  });

  it('toggles the flag without touching the answer', () => {
    const next = applyAnswerChange(view, { attemptQuestionId: 'q1', flagged: true });
    expect(next.questions[0]).toEqual({ id: 'q1', response: { optionId: 'a' }, flagged: true });
    expect(next.flaggedCount).toBe(1);
    expect(next.answeredCount).toBe(1);
  });

  it('does not mutate the cached view', () => {
    applyAnswerChange(view, { attemptQuestionId: 'q2', response: { optionId: 'b' } });
    expect(view.questions[1]?.response).toBeNull();
  });
});

describe('countdown helpers', () => {
  it('measures time left on the server clock', () => {
    // The device clock is 10 s behind the server.
    const receivedAt = Date.parse('2026-10-17T10:00:00.000Z');
    const offset = clockOffsetMs('2026-10-17T10:00:10.000Z', receivedAt);
    expect(offset).toBe(10_000);
    expect(secondsLeft('2026-10-17T10:01:10.000Z', offset, receivedAt)).toBe(60);
  });

  it('never goes below zero', () => {
    expect(secondsLeft('2026-10-17T10:00:00.000Z', 0, Date.parse('2026-10-17T11:00:00.000Z'))).toBe(
      0,
    );
  });
});
