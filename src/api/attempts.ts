import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { type AnswerChange, applyAnswerChange } from './attempt-state';
import { api } from './client';
import { ApiError } from './errors';
import {
  enqueueAnswer,
  flushLegacyAttempt,
  pendingAnswers,
  withPendingAnswers,
} from './legacy-outbox';
import { nextPage, PAGE_SIZE, pageSchema } from './pagination';
import { queryKeys } from './query-keys';

/** ABANDONED: the user started the exam over; answered questions still count in reports. */
export const AttemptStatusSchema = z.enum(['IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'ABANDONED']);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const DifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** An image of the question (chart, table…). `url` is relative to the API origin (`/media/...`). */
export const QuestionMediaSchema = z.object({
  url: z.string(),
  alt: z.string(),
  placement: z.enum(['CONTENT', 'EXPLANATION']),
  width: z.number(),
  height: z.number(),
});
export type QuestionMedia = z.infer<typeof QuestionMediaSchema>;

/** Shared scenario several questions refer to. */
export const CaseStudySchema = z.object({ title: z.string(), content: z.string() });
export type CaseStudy = z.infer<typeof CaseStudySchema>;

/** Fields added after the first release: older attempts (and servers) don't send them. */
const questionExtras = {
  caseStudy: CaseStudySchema.nullable().default(null),
  media: z.array(QuestionMediaSchema).default([]),
  /** "Question N" in the source paper, for imported exams. */
  sourceNumber: z.number().nullable().default(null),
};

export const ConfidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

/**
 * LEGACY: one server deadline (`expiresAt`). SECTIONED: one clock per section, kept by the app
 * (works offline, see `src/attempt-engine`). Older servers don't send the sectioned fields.
 */
const sectionedFields = {
  mode: z.enum(['LEGACY', 'SECTIONED']).default('LEGACY'),
  phase: z
    .enum(['NOT_STARTED', 'IN_SECTION', 'IN_REVIEW', 'BREAK_OFFER', 'ON_BREAK', 'FINISHED'])
    .nullable()
    .default(null),
  currentSectionOrder: z.number().nullable().default(null),
  syncedSeq: z.number().default(0),
  breakMinutes: z.number().nullable().default(null),
  abandonedAt: z.string().nullable().default(null),
};

/** Decision trace of a question (SECTIONED attempts); null until synced. */
const traceFields = {
  confidence: ConfidenceSchema.nullable().default(null),
  eliminatedOptionIds: z.array(z.string()).nullable().default(null),
  firstResponse: z.unknown().optional(),
  dwellMs: z.number().nullable().default(null),
  timeToFirstAnswerMs: z.number().nullable().default(null),
  timeToFinalAnswerMs: z.number().nullable().default(null),
  visitCount: z.number().nullable().default(null),
  answerChangeCount: z.number().nullable().default(null),
  eliminationCount: z.number().nullable().default(null),
  everFlagged: z.boolean().nullable().default(null),
};

const SectionClockSchema = z.object({
  budgetMs: z.number(),
  usedMs: z.number(),
  status: z.enum(['LOCKED', 'ACTIVE', 'COMPLETED']),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  endReason: z.enum(['USER', 'TIME_UP']).nullable(),
  breakTakenMs: z.number().nullable(),
  breakSkipped: z.boolean().nullable(),
});

const AttemptSummarySchema = z.object({
  id: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  status: AttemptStatusSchema,
  ...sectionedFields,
  passingScore: z.number().nullable(),
  startedAt: z.string(),
  /** null = untimed. */
  expiresAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  score: z.number().nullable(),
  maxScore: z.number(),
  correctCount: z.number().nullable(),
  totalQuestions: z.number(),
  passed: z.boolean().nullable(),
});

export const AttemptListItemSchema = AttemptSummarySchema.extend({
  percent: z.number().nullable(),
  answeredCount: z.number().default(0),
});
export type AttemptListItem = z.infer<typeof AttemptListItemSchema>;

/** A question as the test taker sees it: no answer key, explanation, domain or difficulty. */
export const AttemptQuestionSchema = z.object({
  id: z.string(),
  order: z.number(),
  sectionId: z.string().nullable(),
  sectionTitle: z.string(),
  sectionOrder: z.number(),
  points: z.number(),
  /** Type-specific answer (SINGLE_CHOICE: `{ optionId }`); null = not answered. */
  response: z.unknown(),
  flagged: z.boolean(),
  answeredAt: z.string().nullable(),
  ...traceFields,
  type: z.string(),
  content: z.string(),
  /** Only CONTENT images here; explanation images come with the review. */
  ...questionExtras,
  /** Type-specific payload (SINGLE_CHOICE: `{ options: [{ id, content }] }`). */
  data: z.unknown(),
});
export type AttemptQuestion = z.infer<typeof AttemptQuestionSchema>;

export const AttemptViewSchema = AttemptSummarySchema.extend({
  /** Server clock at response time, to run the countdown on server time. */
  serverTime: z.string(),
  answeredCount: z.number(),
  flaggedCount: z.number(),
  sections: z.array(
    z.object({
      sectionId: z.string().nullable(),
      title: z.string(),
      order: z.number(),
      questionCount: z.number(),
      /** SECTIONED only. */
      clock: SectionClockSchema.nullable().default(null),
    }),
  ),
  questions: z.array(AttemptQuestionSchema),
});
export type AttemptView = z.infer<typeof AttemptViewSchema>;

export const SingleChoiceDataSchema = z.object({
  options: z.array(z.object({ id: z.string(), content: z.string() })),
});
export const SingleChoiceResponseSchema = z.object({ optionId: z.string() });
export const SingleChoiceAnswerKeySchema = z.object({ correctOptionId: z.string() });

const TallySchema = z.object({
  total: z.number(),
  answered: z.number(),
  correct: z.number(),
  score: z.number(),
  maxScore: z.number(),
  /** score / maxScore, whole percent. */
  percent: z.number(),
});
export type Tally = z.infer<typeof TallySchema>;

export const AttemptResultSchema = z.object({
  attemptId: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  status: AttemptStatusSchema,
  mode: sectionedFields.mode,
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  abandonedAt: sectionedFields.abandonedAt,
  timeSpentSeconds: z.number().nullable(),
  sectionTiming: z.array(SectionClockSchema.extend({ sectionOrder: z.number() })).default([]),
  score: z.number(),
  maxScore: z.number(),
  percent: z.number(),
  correctCount: z.number(),
  answeredCount: z.number(),
  totalQuestions: z.number(),
  passingScore: z.number().nullable(),
  passed: z.boolean().nullable(),
  breakdown: z.object({
    sections: z.array(
      TallySchema.extend({
        sectionId: z.string().nullable(),
        title: z.string(),
        order: z.number(),
      }),
    ),
    domains: z.array(TallySchema.extend({ domainId: z.string().nullable(), name: z.string() })),
    difficulties: z.array(TallySchema.extend({ difficulty: DifficultySchema })),
  }),
});
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const ReviewQuestionSchema = z.object({
  id: z.string(),
  order: z.number(),
  sectionId: z.string().nullable(),
  sectionTitle: z.string(),
  sectionOrder: z.number(),
  points: z.number(),
  score: z.number().nullable(),
  isCorrect: z.boolean().nullable(),
  response: z.unknown(),
  flagged: z.boolean(),
  ...traceFields,
  type: z.string(),
  content: z.string(),
  difficulty: DifficultySchema,
  domain: z.object({ id: z.string(), name: z.string() }).nullable(),
  ...questionExtras,
  data: z.unknown(),
  answerKey: z.unknown(),
  explanation: z.string().nullable(),
});
export type ReviewQuestion = z.infer<typeof ReviewQuestionSchema>;

export const AttemptReviewSchema = z.object({
  attemptId: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  status: AttemptStatusSchema,
  questions: z.array(ReviewQuestionSchema),
});

const AttemptsPageSchema = pageSchema(AttemptListItemSchema);

export const attemptsQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.attempts.list(),
  queryFn: ({ pageParam, signal }) =>
    api
      .get('attempts', { searchParams: { page: pageParam, limit: PAGE_SIZE }, signal })
      .json(AttemptsPageSchema),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

/** The signed-in user's attempt history, newest first. */
export function useAttempts() {
  return useInfiniteQuery({
    ...attemptsQueryOptions,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/** Attempts in progress on any device (the "continue" cards add those this device doesn't keep). */
export function useAttemptsInProgress() {
  return useQuery({
    queryKey: queryKeys.attempts.inProgress(),
    queryFn: ({ signal }) =>
      api
        .get('attempts', { searchParams: { status: 'IN_PROGRESS', limit: PAGE_SIZE }, signal })
        .json(AttemptsPageSchema),
    select: (page) => page.items,
  });
}

export const attemptQueryOptions = (attemptId: string) =>
  queryOptions({
    queryKey: queryKeys.attempts.detail(attemptId),
    queryFn: async ({ signal }) => {
      const view = await api.get(`attempts/${attemptId}`, { signal }).json(AttemptViewSchema);
      // LEGACY answers picked offline are not on the server yet: show them anyway.
      return view.mode === 'LEGACY' && view.status === 'IN_PROGRESS'
        ? withPendingAnswers(attemptId, view)
        : view;
    },
    // The countdown needs a fresh `serverTime` every time the screen opens.
    staleTime: 0,
  });

export function useAttempt(attemptId: string) {
  return useQuery(attemptQueryOptions(attemptId));
}

/**
 * Saves one answer or flag (LEGACY). It is kept on the device first and sent right away, or when
 * the connection comes back (`legacy-outbox.ts`). The cache is updated immediately (the UI never
 * waits for the network) and rolled back only if the server refuses the change.
 */
export function useSaveAnswer(attemptId: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.attempts.detail(attemptId);

  return useMutation({
    mutationKey: ['attempts', 'answer', attemptId],
    mutationFn: async (change: AnswerChange) => {
      enqueueAnswer(attemptId, change);
      return flushLegacyAttempt(attemptId);
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AttemptView>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, applyAnswerChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });
}

/** Grades the attempt. Safe to retry: the server returns the same result for a closed attempt. */
export function useSubmitAttempt(attemptId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['attempts', 'submit', attemptId],
    mutationFn: async () => {
      // Every answer must be on the server before grading.
      await flushLegacyAttempt(attemptId).catch(() => undefined);
      if (pendingAnswers(attemptId).length > 0) throw new ApiError('network');
      return api.post(`attempts/${attemptId}/submit`).json(AttemptResultSchema);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.attempts.result(attemptId), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.detail(result.examId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}

export function useAttemptResult(attemptId: string) {
  return useQuery({
    queryKey: queryKeys.attempts.result(attemptId),
    queryFn: ({ signal }) =>
      api.get(`attempts/${attemptId}/result`, { signal }).json(AttemptResultSchema),
    // A closed attempt never changes.
    staleTime: Infinity,
  });
}

export function useAttemptReview(attemptId: string) {
  return useQuery({
    queryKey: queryKeys.attempts.review(attemptId),
    queryFn: ({ signal }) =>
      api.get(`attempts/${attemptId}/review`, { signal }).json(AttemptReviewSchema),
    staleTime: Infinity,
  });
}
