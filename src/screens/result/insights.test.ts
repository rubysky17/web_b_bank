import type { ReviewQuestion } from '@/api/attempts';

import { decisionInsights } from './insights';

let order = 0;
function question(extra: Partial<ReviewQuestion>): ReviewQuestion {
  order++;
  return {
    id: `q${order}`,
    order,
    sectionId: 's1',
    sectionTitle: 'Section 1',
    sectionOrder: 1,
    points: 1,
    score: null,
    isCorrect: null,
    response: null,
    flagged: false,
    confidence: null,
    eliminatedOptionIds: null,
    firstResponse: null,
    dwellMs: null,
    timeToFirstAnswerMs: null,
    timeToFinalAnswerMs: null,
    visitCount: null,
    answerChangeCount: null,
    eliminationCount: null,
    everFlagged: null,
    type: 'SINGLE_CHOICE',
    content: `Q${order}`,
    difficulty: 'MEDIUM',
    domain: null,
    caseStudy: null,
    media: [],
    sourceNumber: null,
    data: { options: ['A', 'B', 'C', 'D'].map((id) => ({ id, content: id })) },
    answerKey: { correctOptionId: 'A' },
    explanation: null,
    ...extra,
  };
}

const answered = (optionId: string, extra: Partial<ReviewQuestion> = {}) =>
  question({
    response: { optionId },
    firstResponse: { optionId },
    isCorrect: optionId === 'A',
    dwellMs: 60_000,
    timeToFinalAnswerMs: 50_000,
    answerChangeCount: 0,
    eliminationCount: 0,
    ...extra,
  });

const result = {
  breakdown: {
    sections: [
      {
        sectionId: 's1',
        title: 'Section 1',
        order: 1,
        total: 0,
        answered: 0,
        correct: 0,
        score: 0,
        maxScore: 0,
        percent: 0,
      },
    ],
    domains: [],
    difficulties: [],
  },
  sectionTiming: [
    {
      sectionOrder: 1,
      budgetMs: 3_600_000,
      usedMs: 1_800_000,
      status: 'COMPLETED' as const,
      startedAt: null,
      endedAt: null,
      endReason: 'USER' as const,
      breakTakenMs: null,
      breakSkipped: true,
    },
  ],
};

describe('decisionInsights', () => {
  it('crosses confidence with the result', () => {
    const insight = decisionInsights(
      [
        answered('A', { confidence: 'HIGH' }),
        answered('B', { confidence: 'HIGH' }),
        answered('A', { confidence: 'LOW' }),
        answered('C'),
        question({}),
      ],
      result,
    );
    expect(insight.confidence).toEqual({
      HIGH: { correct: 1, wrong: 1 },
      MEDIUM: { correct: 0, wrong: 0 },
      LOW: { correct: 1, wrong: 0 },
      NONE: { correct: 0, wrong: 1 },
    });
  });

  it('spots likely guesses: not sure, or fast without crossing anything out', () => {
    const insight = decisionInsights(
      [
        answered('A', { confidence: 'LOW' }),
        answered('B', { timeToFinalAnswerMs: 5_000 }),
        answered('A', { timeToFinalAnswerMs: 5_000, confidence: 'HIGH' }),
        answered('A', { timeToFinalAnswerMs: 5_000, eliminationCount: 2 }),
      ],
      result,
    );
    expect(insight.guesses).toEqual({ count: 2, correct: 1 });
  });

  it('scores eliminations and answer changes', () => {
    const insight = decisionInsights(
      [
        answered('A', { eliminatedOptionIds: ['B', 'C'], eliminationCount: 2 }),
        answered('B', { eliminatedOptionIds: ['A'], eliminationCount: 1 }),
        answered('A', { firstResponse: { optionId: 'C' }, answerChangeCount: 1 }),
        answered('D', { firstResponse: { optionId: 'A' }, answerChangeCount: 1 }),
        answered('D', { firstResponse: { optionId: 'B' }, answerChangeCount: 2 }),
      ],
      result,
    );
    expect(insight.elimination).toEqual({ total: 3, wrongOptions: 2, correctEliminated: 1 });
    expect(insight.changes).toEqual({ wrongToRight: 1, rightToWrong: 1, wrongToWrong: 1 });
  });

  it('reports pacing per section and the slowest questions', () => {
    const insight = decisionInsights(
      [
        answered('A', { timeToFinalAnswerMs: 30_000, dwellMs: 40_000 }),
        answered('B', { timeToFinalAnswerMs: 90_000, dwellMs: 200_000 }),
        question({ dwellMs: 10_000, everFlagged: true }),
      ],
      result,
    );
    expect(insight.sections[0]).toMatchObject({
      title: 'Section 1',
      usedMs: 1_800_000,
      avgAnswerMs: 60_000,
      breakSkipped: true,
    });
    expect(insight.slowest.map((q) => q.dwellMs)).toEqual([200_000, 40_000, 10_000]);
    expect(insight.flags).toEqual({ total: 1, answered: 0, correct: 0 });
  });
});
