import type { QuestionTrace } from './types';

/**
 * Per-question timing, on the section clock. A visit runs from QUESTION_VIEW to QUESTION_LEAVE (or the
 * end of the section); time on a question is the sum of its visits, so leaving a question and coming
 * back to answer it counts both visits.
 */

export const emptyTrace = (id: string, sectionOrder: number): QuestionTrace => ({
  id,
  sectionOrder,
  response: null,
  firstResponse: null,
  flagged: false,
  everFlagged: false,
  confidence: null,
  eliminated: [],
  dwellMs: 0,
  viewingSince: null,
  timeToFirstAnswerMs: null,
  timeToFinalAnswerMs: null,
  visitCount: 0,
  answerChangeCount: 0,
  eliminationCount: 0,
});

/** Time on the question so far, the visit in progress included. */
export const dwellAt = (trace: QuestionTrace, activeMs: number) =>
  trace.dwellMs + (trace.viewingSince === null ? 0 : Math.max(0, activeMs - trace.viewingSince));

export const openVisit = (trace: QuestionTrace, activeMs: number): QuestionTrace =>
  trace.viewingSince === null
    ? { ...trace, viewingSince: activeMs, visitCount: trace.visitCount + 1 }
    : trace;

export const closeVisit = (trace: QuestionTrace, activeMs: number): QuestionTrace =>
  trace.viewingSince === null
    ? trace
    : { ...trace, dwellMs: dwellAt(trace, activeMs), viewingSince: null };

const sameAnswer = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A pick: the first one sets "time to first answer", every one sets "time to final answer". */
export function pickAnswer(
  trace: QuestionTrace,
  response: unknown,
  activeMs: number,
): QuestionTrace {
  if (sameAnswer(trace.response, response)) return trace;
  const at = dwellAt(trace, activeMs);
  const isFirst = trace.firstResponse === null;
  return {
    ...trace,
    response,
    firstResponse: isFirst ? response : trace.firstResponse,
    timeToFirstAnswerMs: isFirst ? at : trace.timeToFirstAnswerMs,
    timeToFinalAnswerMs: at,
    answerChangeCount:
      !isFirst && trace.response !== null ? trace.answerChangeCount + 1 : trace.answerChangeCount,
  };
}

export const clearAnswer = (trace: QuestionTrace): QuestionTrace =>
  trace.response === null ? trace : { ...trace, response: null, timeToFinalAnswerMs: null };

export const isAnswered = (trace: QuestionTrace | undefined) =>
  trace !== undefined && trace.response !== null;
