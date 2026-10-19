import type { AttemptResult, ReviewQuestion } from '@/api/attempts';
// The model only: the barrel pulls in native UI.
import { isAnswerCorrect, parseAnswer, parseKey } from '@/components/question/answer-model';

/** Answered this fast without crossing anything out (and not "very sure") looks like a guess. */
export const GUESS_UNDER_MS = 15_000;
const SLOWEST_COUNT = 3;

type Cell = { correct: number; wrong: number };

export type DecisionInsights = {
  /** Answered questions by confidence level and result. */
  confidence: Record<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', Cell>;
  guesses: { count: number; correct: number };
  elimination: {
    /** Options crossed out (as they stood at the end). */
    total: number;
    /** Of those, wrong options: a good elimination. */
    wrongOptions: number;
    /** Questions where the right option was crossed out. */
    correctEliminated: number;
  };
  changes: { wrongToRight: number; rightToWrong: number; wrongToWrong: number };
  flags: { total: number; answered: number; correct: number };
  sections: {
    order: number;
    title: string;
    usedMs: number;
    budgetMs: number;
    /** Average time to the final answer over answered questions; null when none. */
    avgAnswerMs: number | null;
    breakTakenMs: number | null;
    breakSkipped: boolean | null;
  }[];
  /** Questions that took longest (time on question), for "where did the time go". */
  slowest: { order: number; dwellMs: number }[];
};

/** Correct options of a choice question (eliminating one of them is a mistake). */
function correctOptions(question: ReviewQuestion): string[] {
  const key = parseKey(question.type, question.answerKey);
  if (key?.type === 'SINGLE_CHOICE') return [key.correctOptionId];
  if (key?.type === 'MULTIPLE_CHOICE') return key.correctOptionIds;
  return [];
}

function isCorrect(question: ReviewQuestion, response: unknown) {
  const key = parseKey(question.type, question.answerKey);
  return key !== null && isAnswerCorrect(key, parseAnswer(question.type, response));
}

/** What the decision trace says about how the user answered (sectioned attempts). */
export function decisionInsights(
  questions: ReviewQuestion[],
  result: Pick<AttemptResult, 'sectionTiming' | 'breakdown'>,
): DecisionInsights {
  const confidence: DecisionInsights['confidence'] = {
    HIGH: { correct: 0, wrong: 0 },
    MEDIUM: { correct: 0, wrong: 0 },
    LOW: { correct: 0, wrong: 0 },
    NONE: { correct: 0, wrong: 0 },
  };
  const guesses = { count: 0, correct: 0 };
  const elimination = { total: 0, wrongOptions: 0, correctEliminated: 0 };
  const changes = { wrongToRight: 0, rightToWrong: 0, wrongToWrong: 0 };
  const flags = { total: 0, answered: 0, correct: 0 };
  const answerTimes = new Map<number, number[]>();

  for (const q of questions) {
    const answered = q.response != null;
    const right = q.isCorrect === true;

    if (answered) {
      confidence[q.confidence ?? 'NONE'][right ? 'correct' : 'wrong']++;
      const fast =
        q.timeToFinalAnswerMs !== null &&
        q.timeToFinalAnswerMs < GUESS_UNDER_MS &&
        (q.eliminationCount ?? 0) === 0 &&
        q.confidence !== 'HIGH';
      if (q.confidence === 'LOW' || fast) {
        guesses.count++;
        if (right) guesses.correct++;
      }
      if (q.timeToFinalAnswerMs !== null) {
        const times = answerTimes.get(q.sectionOrder) ?? [];
        times.push(q.timeToFinalAnswerMs);
        answerTimes.set(q.sectionOrder, times);
      }
      if ((q.answerChangeCount ?? 0) > 0 && q.firstResponse != null) {
        const firstRight = isCorrect(q, q.firstResponse);
        if (!firstRight && right) changes.wrongToRight++;
        else if (firstRight && !right) changes.rightToWrong++;
        else if (!firstRight && !right) changes.wrongToWrong++;
      }
    }

    const eliminated = q.eliminatedOptionIds ?? [];
    if (eliminated.length > 0) {
      const correctIds = correctOptions(q);
      elimination.total += eliminated.length;
      elimination.wrongOptions += eliminated.filter((id) => !correctIds.includes(id)).length;
      if (eliminated.some((id) => correctIds.includes(id))) elimination.correctEliminated++;
    }

    if (q.everFlagged ?? q.flagged) {
      flags.total++;
      if (answered) flags.answered++;
      if (right) flags.correct++;
    }
  }

  const titles = new Map(result.breakdown.sections.map((s) => [s.order, s.title]));
  const sections = result.sectionTiming.map((s) => {
    const times = answerTimes.get(s.sectionOrder) ?? [];
    return {
      order: s.sectionOrder,
      title: titles.get(s.sectionOrder) ?? String(s.sectionOrder),
      usedMs: s.usedMs,
      budgetMs: s.budgetMs,
      avgAnswerMs: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null,
      breakTakenMs: s.breakTakenMs,
      breakSkipped: s.breakSkipped,
    };
  });

  const slowest = questions
    .filter((q) => (q.dwellMs ?? 0) > 0)
    .sort((a, b) => (b.dwellMs ?? 0) - (a.dwellMs ?? 0))
    .slice(0, SLOWEST_COUNT)
    .map((q) => ({ order: q.order, dwellMs: q.dwellMs ?? 0 }));

  return { confidence, guesses, elimination, changes, flags, sections, slowest };
}
