import {
  activeCount,
  filterOptions,
  fromReviewParams,
  matches,
  NO_FILTERS,
  outcomeOf,
  type ReviewFilters,
  toReviewParams,
} from './review-filters';

type Q = Parameters<typeof matches>[0];

const question = (overrides: Partial<Q> = {}): Q => ({
  type: 'SINGLE_CHOICE',
  response: { optionId: 'a' },
  isCorrect: true,
  difficulty: 'EASY',
  domain: { id: 'd1', name: 'People' },
  sectionId: 's1',
  sectionTitle: 'Section 1',
  everFlagged: null,
  flagged: false,
  ...overrides,
});

const filters = (overrides: Partial<ReviewFilters>): ReviewFilters => ({
  ...NO_FILTERS,
  ...overrides,
});

describe('outcomeOf', () => {
  it('tells correct, wrong and not answered apart', () => {
    expect(outcomeOf(question())).toBe('correct');
    expect(outcomeOf(question({ isCorrect: false }))).toBe('wrong');
    expect(outcomeOf(question({ response: null, isCorrect: null }))).toBe('notAnswered');
  });
});

describe('matches', () => {
  const wrongExpert = question({ isCorrect: false, difficulty: 'EXPERT' });

  it('keeps everything without filters', () => {
    expect(matches(wrongExpert, NO_FILTERS)).toBe(true);
  });

  it('ORs values inside a group and ANDs groups', () => {
    expect(matches(wrongExpert, filters({ outcomes: ['wrong', 'notAnswered'] }))).toBe(true);
    expect(
      matches(wrongExpert, filters({ outcomes: ['wrong'], difficulties: ['EXPERT', 'HARD'] })),
    ).toBe(true);
    expect(matches(wrongExpert, filters({ outcomes: ['wrong'], difficulties: ['EASY'] }))).toBe(
      false,
    );
  });

  it('matches questions without a domain with "none"', () => {
    const orphan = question({ domain: null });
    expect(matches(orphan, filters({ domainIds: ['none'] }))).toBe(true);
    expect(matches(orphan, filters({ domainIds: ['d1'] }))).toBe(false);
  });

  it('uses everFlagged over the final flag', () => {
    const f = filters({ flagged: true });
    expect(matches(question({ everFlagged: true, flagged: false }), f)).toBe(true);
    expect(matches(question({ everFlagged: null, flagged: true }), f)).toBe(true);
    expect(matches(question(), f)).toBe(false);
  });
});

describe('filterOptions', () => {
  it('counts the values present in the attempt', () => {
    const options = filterOptions([
      question({ difficulty: 'HARD' }),
      question({ isCorrect: false, domain: null }),
      question({ difficulty: 'HARD', sectionId: 's2', sectionTitle: 'Section 2' }),
    ]);
    expect(options.outcomes).toEqual([
      { value: 'correct', count: 2 },
      { value: 'wrong', count: 1 },
      { value: 'notAnswered', count: 0 },
    ]);
    expect(options.difficulties).toEqual([
      { value: 'EASY', count: 1 },
      { value: 'HARD', count: 2 },
    ]);
    expect(options.domains).toEqual([
      { value: 'd1', label: 'People', count: 2 },
      { value: 'none', label: '', count: 1 },
    ]);
    expect(options.sections.map((s) => s.count)).toEqual([2, 1]);
  });
});

describe('review filters as route params', () => {
  it('round-trips and drops empty groups', () => {
    const f = filters({ outcomes: ['wrong'], difficulties: ['EXPERT', 'HARD'], flagged: true });
    const params = toReviewParams(f, 'q9');
    expect(params).toEqual({
      outcome: 'wrong',
      difficulty: 'EXPERT,HARD',
      flagged: '1',
      q: 'q9',
    });
    expect(fromReviewParams(params)).toEqual({ filters: f, questionId: 'q9' });
    expect(activeCount(f)).toBe(4);
  });

  it('ignores garbage', () => {
    expect(fromReviewParams({ outcome: 'maybe,wrong,wrong', difficulty: 'WHAT', q: '' })).toEqual({
      filters: filters({ outcomes: ['wrong'] }),
      questionId: undefined,
    });
  });
});
