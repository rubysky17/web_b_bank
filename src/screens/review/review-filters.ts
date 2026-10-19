import { type Difficulty, DifficultySchema, type ReviewQuestion } from '@/api/attempts';
import { parseAnswer } from '@/components/question/answer-model';

export const OUTCOMES = ['correct', 'wrong', 'notAnswered'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Domain id of the questions without a domain. */
export const NO_DOMAIN = 'none';

/** Values picked in each group: OR inside a group, AND across groups; empty = not filtered. */
export type ReviewFilters = {
  outcomes: Outcome[];
  difficulties: Difficulty[];
  domainIds: string[];
  sectionIds: string[];
  flagged: boolean;
};

export const NO_FILTERS: ReviewFilters = {
  outcomes: [],
  difficulties: [],
  domainIds: [],
  sectionIds: [],
  flagged: false,
};

type OutcomeFields = Pick<ReviewQuestion, 'type' | 'response' | 'isCorrect'>;

export function outcomeOf(question: OutcomeFields): Outcome {
  if (parseAnswer(question.type, question.response) === null) return 'notAnswered';
  return question.isCorrect ? 'correct' : 'wrong';
}

export const domainIdOf = (question: Pick<ReviewQuestion, 'domain'>) =>
  question.domain?.id ?? NO_DOMAIN;

export const wasFlagged = (question: Pick<ReviewQuestion, 'everFlagged' | 'flagged'>) =>
  question.everFlagged ?? question.flagged;

type FilterFields = OutcomeFields &
  Pick<
    ReviewQuestion,
    'difficulty' | 'domain' | 'sectionId' | 'sectionTitle' | 'everFlagged' | 'flagged'
  >;

export function matches(question: FilterFields, filters: ReviewFilters): boolean {
  const any = <T>(picked: readonly T[], value: T) => picked.length === 0 || picked.includes(value);
  return (
    any(filters.outcomes, outcomeOf(question)) &&
    any(filters.difficulties, question.difficulty) &&
    any(filters.domainIds, domainIdOf(question)) &&
    any(filters.sectionIds, question.sectionId ?? '') &&
    (!filters.flagged || wasFlagged(question))
  );
}

/** Number of picked values, for the filter badge. */
export function activeCount(filters: ReviewFilters): number {
  return (
    filters.outcomes.length +
    filters.difficulties.length +
    filters.domainIds.length +
    filters.sectionIds.length +
    (filters.flagged ? 1 : 0)
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count: number };

/** Values present in the attempt, in first-seen order (difficulties in level order), with counts. */
export function filterOptions(questions: readonly FilterFields[]) {
  const tally = <T extends string>(entries: { value: T; label: string }[]) => {
    const byValue = new Map<T, FilterOption<T>>();
    for (const { value, label } of entries) {
      const option = byValue.get(value);
      if (option) option.count += 1;
      else byValue.set(value, { value, label, count: 1 });
    }
    return [...byValue.values()];
  };
  const counts = (pick: (q: FilterFields) => string) => {
    const result = new Map<string, number>();
    for (const q of questions) result.set(pick(q), (result.get(pick(q)) ?? 0) + 1);
    return result;
  };
  const outcomeCounts = counts(outcomeOf);
  const difficultyCounts = counts((q) => q.difficulty);

  return {
    outcomes: OUTCOMES.map((value) => ({ value, count: outcomeCounts.get(value) ?? 0 })),
    difficulties: DifficultySchema.options.flatMap((value) => {
      const count = difficultyCounts.get(value) ?? 0;
      return count > 0 ? [{ value, count }] : [];
    }),
    // Labels of these come from the data; a null domain is labelled by the caller.
    domains: tally(questions.map((q) => ({ value: domainIdOf(q), label: q.domain?.name ?? '' }))),
    sections: tally(
      questions.flatMap((q) =>
        q.sectionId === null ? [] : [{ value: q.sectionId, label: q.sectionTitle }],
      ),
    ),
    flagged: questions.filter(wasFlagged).length,
  };
}

/** Filters (and the question to open) → route params; empty groups are left out. */
export function toReviewParams(
  filters: Partial<ReviewFilters>,
  questionId?: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  const put = (key: string, values: readonly string[] | undefined) => {
    if (values && values.length > 0) params[key] = values.join(',');
  };
  put('outcome', filters.outcomes);
  put('difficulty', filters.difficulties);
  put('domain', filters.domainIds);
  put('section', filters.sectionIds);
  if (filters.flagged) params.flagged = '1';
  if (questionId) params.q = questionId;
  return params;
}

/** Route params → filters; unknown outcomes and difficulties are ignored. */
export function fromReviewParams(params: Record<string, string | string[] | undefined>): {
  filters: ReviewFilters;
  questionId: string | undefined;
} {
  const list = (key: string) => {
    const value = params[key];
    const text = Array.isArray(value) ? value.join(',') : (value ?? '');
    return [...new Set(text.split(',').filter((part) => part.length > 0))];
  };
  const q = params.q;
  return {
    filters: {
      outcomes: list('outcome').filter((v): v is Outcome =>
        (OUTCOMES as readonly string[]).includes(v),
      ),
      difficulties: list('difficulty').flatMap((v) => {
        const parsed = DifficultySchema.safeParse(v);
        return parsed.success ? [parsed.data] : [];
      }),
      domainIds: list('domain'),
      sectionIds: list('section'),
      flagged: params.flagged === '1',
    },
    questionId: typeof q === 'string' && q.length > 0 ? q : undefined,
  };
}

/** Adds the value to the group, or removes it when already there. */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
