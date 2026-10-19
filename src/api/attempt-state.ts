/**
 * Pure helpers for the attempt cache (no network, no React), so they are easy to unit test.
 */

export type AnswerChange = {
  attemptQuestionId: string;
  /** Omit to keep the current answer; null clears it. */
  response?: unknown;
  /** Omit to keep the current flag. */
  flagged?: boolean;
  /** Foreground ms spent on the question before this pick; the server adds it to the question's total. */
  timeSpentMs?: number;
};

type ViewLike<Q> = {
  answeredCount: number;
  flaggedCount: number;
  questions: Q[];
};

type QuestionLike = { id: string; response: unknown; flagged: boolean };

/** Applies an answer/flag change to a cached attempt view (optimistic update), counters included. */
export function applyAnswerChange<Q extends QuestionLike, V extends ViewLike<Q>>(
  view: V,
  change: AnswerChange,
): V {
  const questions = view.questions.map((question) => {
    if (question.id !== change.attemptQuestionId) return question;
    return {
      ...question,
      ...(change.response !== undefined ? { response: change.response } : {}),
      ...(change.flagged !== undefined ? { flagged: change.flagged } : {}),
    };
  });
  return {
    ...view,
    questions,
    answeredCount: questions.filter((question) => question.response != null).length,
    flaggedCount: questions.filter((question) => question.flagged).length,
  };
}

/** Milliseconds to add to the device clock to get the server clock. */
export const clockOffsetMs = (serverTime: string, receivedAt = Date.now()) =>
  new Date(serverTime).getTime() - receivedAt;

/** Whole seconds left before `expiresAt` (never negative), measured on the server clock. */
export function secondsLeft(expiresAt: string, offsetMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - (now + offsetMs)) / 1000));
}
