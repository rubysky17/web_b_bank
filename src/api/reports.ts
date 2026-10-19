import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { AttemptStatusSchema } from './attempts';
import { api } from './client';
import { queryKeys } from './query-keys';

/** Most exams one comparison can hold (the server enforces the same limit). */
export const MAX_COMPARE = 5;

const OutcomesSchema = z.object({
  total: z.number(),
  correct: z.number(),
  wrong: z.number(),
  unanswered: z.number(),
});

/** An exam the user has finished at least once (report picker). */
export const ReportExamSchema = z.object({
  examId: z.string(),
  examTitle: z.string(),
  attemptCount: z.number(),
  lastAttemptAt: z.string(),
  /** Correct answers / questions over all attempts, whole percent. */
  avgCorrectPercent: z.number(),
});
export type ReportExam = z.infer<typeof ReportExamSchema>;

const ReportAttemptSchema = z.object({
  attemptId: z.string(),
  startedAt: z.string(),
  status: AttemptStatusSchema,
  correctPercent: z.number(),
  correctCount: z.number(),
  answeredCount: z.number(),
  totalQuestions: z.number(),
  durationSeconds: z.number(),
  avgTimePerAnswerMs: z.number().nullable(),
  /** true = recorded before the app measured answer time; estimated from the duration. */
  timeEstimated: z.boolean(),
});

const ReportDomainSchema = OutcomesSchema.extend({
  /** null = questions without a domain. */
  domainId: z.string().nullable(),
  name: z.string().nullable(),
  correctPercent: z.number(),
  /** Measured answers only; null when none were timed. */
  avgTimePerAnswerMs: z.number().nullable(),
});
export type ReportDomain = z.infer<typeof ReportDomainSchema>;

export const TimeSourceSchema = z.enum(['measured', 'estimated', 'mixed']);
export type TimeSource = z.infer<typeof TimeSourceSchema>;

/**
 * One exam over the user's finished attempts. "% correct" is correct answers / questions, not the
 * points-based `percent` shown in results and history.
 */
export const ExamReportSchema = z.object({
  examId: z.string(),
  examTitle: z.string(),
  summary: z.object({
    attemptCount: z.number(),
    avgCorrectPercent: z.number(),
    latestCorrectPercent: z.number(),
    bestCorrectPercent: z.number(),
    avgTimePerAnswerMs: z.number().nullable(),
    timeSource: TimeSourceSchema.nullable(),
    outcomes: OutcomesSchema,
  }),
  /** Oldest → newest. */
  attempts: z.array(ReportAttemptSchema),
  /** Sorted by name; the domain-less group last. */
  domains: z.array(ReportDomainSchema),
});
export type ExamReport = z.infer<typeof ExamReportSchema>;

const ReportExamsSchema = z.object({ items: z.array(ReportExamSchema) });
const CompareReportSchema = z.object({ exams: z.array(ExamReportSchema) });

/** Exams with at least one finished attempt, most recent first. */
export function useReportExams() {
  return useQuery({
    queryKey: queryKeys.reports.exams(),
    queryFn: ({ signal }) => api.get('reports/exams', { signal }).json(ReportExamsSchema),
    select: (data) => data.items,
  });
}

export function useExamReport(examId: string | null) {
  return useQuery({
    queryKey: queryKeys.reports.exam(examId ?? ''),
    queryFn: examId
      ? ({ signal }) => api.get(`reports/exams/${examId}`, { signal }).json(ExamReportSchema)
      : skipToken,
    // Switching exams keeps the previous report on screen instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

/** Reports of 2–5 exams, in the order given. */
export function useCompareReport(examIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.reports.compare(examIds),
    queryFn:
      examIds.length >= 2
        ? ({ signal }) =>
            api
              .get('reports/compare', { searchParams: { examIds: examIds.join(',') }, signal })
              .json(CompareReportSchema)
        : skipToken,
    placeholderData: keepPreviousData,
    select: (data) => data.exams,
  });
}
