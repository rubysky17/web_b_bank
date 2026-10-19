import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { AttemptViewSchema, DifficultySchema } from './attempts';
import { api } from './client';
import { nextPage, PAGE_SIZE, pageSchema } from './pagination';
import { queryKeys } from './query-keys';

/** A published exam as listed in the catalog (never contains question content). */
export const CatalogExamSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  /** null = untimed. */
  durationMinutes: z.number().nullable(),
  /** Break offered between timed sections. */
  breakMinutes: z.number().nullable().default(null),
  /** Pass mark in percent; null = no pass/fail. */
  passingScore: z.number().nullable(),
  publishedAt: z.string().nullable(),
  topic: z.object({ id: z.string(), name: z.string() }),
  owner: z.object({ id: z.string(), fullName: z.string() }),
  questionCount: z.number(),
  sectionCount: z.number(),
});
export type CatalogExam = z.infer<typeof CatalogExamSchema>;

export const CatalogExamDetailSchema = CatalogExamSchema.extend({
  totalPoints: z.number(),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      order: z.number(),
      instructions: z.string().nullable(),
      /** When every section has one, the exam is taken section by section. */
      durationMinutes: z.number().nullable().default(null),
      questionCount: z.number(),
    }),
  ),
  /** Question counts per domain and difficulty. */
  breakdown: z
    .object({
      domains: z.array(
        z.object({ domainId: z.string().nullable(), name: z.string(), questionCount: z.number() }),
      ),
      difficulties: z.array(z.object({ difficulty: DifficultySchema, questionCount: z.number() })),
    })
    .default({ domains: [], difficulties: [] }),
  myAttemptCount: z.number(),
  /** The user's unfinished attempt on this exam, to offer "resume". */
  inProgressAttemptId: z.string().nullable(),
});
export type CatalogExamDetail = z.infer<typeof CatalogExamDetailSchema>;

const CatalogPageSchema = pageSchema(CatalogExamSchema);

export const catalogQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.catalog.list(),
  queryFn: ({ pageParam, signal }) =>
    api
      .get('catalog/exams', { searchParams: { page: pageParam, limit: PAGE_SIZE }, signal })
      .json(CatalogPageSchema),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export function useCatalog() {
  return useInfiniteQuery({
    ...catalogQueryOptions,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

export const catalogExamQueryOptions = (examId: string) =>
  queryOptions({
    queryKey: queryKeys.catalog.detail(examId),
    queryFn: ({ signal }) =>
      api.get(`catalog/exams/${examId}`, { signal }).json(CatalogExamDetailSchema),
  });

export function useCatalogExam(examId: string) {
  return useQuery(catalogExamQueryOptions(examId));
}

const StartAttemptSchema = AttemptViewSchema.extend({
  /** true when the server returned the attempt already in progress instead of a new one. */
  resumed: z.boolean(),
});

/**
 * Starts an attempt, or resumes the one in progress. The result seeds the attempt screen's cache.
 * `fresh: true` abandons the one in progress (it stays in history and reports) and starts over.
 */
export function useStartAttempt(examId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['attempts', 'start', examId],
    mutationFn: (options: { fresh?: boolean } | void) =>
      api
        .post(`catalog/exams/${examId}/attempts`, { json: options ?? {} })
        .json(StartAttemptSchema),
    onSuccess: ({ resumed: _resumed, ...attempt }) => {
      queryClient.setQueryData(queryKeys.attempts.detail(attempt.id), attempt);
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.detail(examId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.list() });
    },
  });
}
