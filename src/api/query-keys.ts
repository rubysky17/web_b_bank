/**
 * Every query key lives here so invalidation is typo-proof:
 * `queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all })`.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    list: () => [...queryKeys.catalog.all, 'list'] as const,
    detail: (examId: string) => [...queryKeys.catalog.all, 'detail', examId] as const,
  },
  bank: {
    all: ['bank'] as const,
    facets: () => [...queryKeys.bank.all, 'facets'] as const,
    list: (filters: object) => [...queryKeys.bank.all, 'list', filters] as const,
  },
  attempts: {
    all: ['attempts'] as const,
    list: () => [...queryKeys.attempts.all, 'list'] as const,
    inProgress: () => [...queryKeys.attempts.all, 'in-progress'] as const,
    detail: (attemptId: string) => [...queryKeys.attempts.all, 'detail', attemptId] as const,
    result: (attemptId: string) => [...queryKeys.attempts.all, 'result', attemptId] as const,
    review: (attemptId: string) => [...queryKeys.attempts.all, 'review', attemptId] as const,
  },
  reports: {
    all: ['reports'] as const,
    exams: () => [...queryKeys.reports.all, 'exams'] as const,
    exam: (examId: string) => [...queryKeys.reports.all, 'exam', examId] as const,
    /** In request order: the server answers in that order too. */
    compare: (examIds: readonly string[]) =>
      [...queryKeys.reports.all, 'compare', ...examIds] as const,
  },
};
