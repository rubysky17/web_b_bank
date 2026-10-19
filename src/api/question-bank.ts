import { infiniteQueryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import {
  CaseStudySchema,
  type Difficulty,
  DifficultySchema,
  QuestionMediaSchema,
} from './attempts';
import { api } from './client';
import { nextPage, pageSchema } from './pagination';
import { queryKeys } from './query-keys';

/** Bigger pages than other lists: practice walks through them one question at a time. */
const BANK_PAGE_SIZE = 50;

/** A question of a published exam, with its answer and explanation (self-study). */
export const BankQuestionSchema = z.object({
  /** Placement id (one question can appear in several exams). */
  id: z.string(),
  questionId: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  sectionOrder: z.number(),
  order: z.number(),
  sourceNumber: z.number().nullable(),
  type: z.string(),
  difficulty: DifficultySchema,
  content: z.string(),
  explanation: z.string().nullable(),
  media: z.array(QuestionMediaSchema),
  /** SINGLE_CHOICE: `{ options: [{ id, content, isCorrect }] }`. */
  definition: z.unknown(),
  domain: z.object({ id: z.string(), name: z.string() }).nullable(),
  caseStudy: CaseStudySchema.nullable(),
});
export type BankQuestion = z.infer<typeof BankQuestionSchema>;

export const BankOptionsSchema = z.object({
  options: z.array(z.object({ id: z.string(), content: z.string(), isCorrect: z.boolean() })),
});

const BankFacetsSchema = z.object({
  exams: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      questionCount: z.number(),
      sections: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          order: z.number(),
          questionCount: z.number(),
        }),
      ),
    }),
  ),
  domains: z.array(z.object({ id: z.string(), name: z.string(), questionCount: z.number() })),
  difficulties: z.array(z.object({ difficulty: DifficultySchema, questionCount: z.number() })),
});
export type BankFacets = z.infer<typeof BankFacetsSchema>;

export type BankFilters = {
  examId?: string;
  sectionId?: string;
  domainId?: string;
  difficulty?: Difficulty;
};

const BankPageSchema = pageSchema(BankQuestionSchema);

export function useBankFacets() {
  return useQuery({
    queryKey: queryKeys.bank.facets(),
    queryFn: ({ signal }) => api.get('catalog/questions/facets', { signal }).json(BankFacetsSchema),
  });
}

export const bankQuestionsQueryOptions = (filters: BankFilters) =>
  infiniteQueryOptions({
    queryKey: queryKeys.bank.list(filters),
    queryFn: ({ pageParam, signal }) =>
      api
        .get('catalog/questions', {
          // ky drops undefined values from searchParams.
          searchParams: { ...filters, page: pageParam, limit: BANK_PAGE_SIZE },
          signal,
        })
        .json(BankPageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });

/** Questions matching the filters, in paper order (exam, section, question number). */
export function useBankQuestions(filters: BankFilters) {
  return useInfiniteQuery({
    ...bankQuestionsQueryOptions(filters),
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages[0]?.total ?? 0,
    }),
  });
}
