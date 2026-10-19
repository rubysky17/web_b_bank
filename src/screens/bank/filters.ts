import type { Difficulty } from '@/api/attempts';
import { DifficultySchema } from '@/api/attempts';
import type { BankFilters } from '@/api/question-bank';

/** Route params of the practice screen: the bank filters plus where to start. */
export type PracticeParams = BankFilters & { start?: string };

/** Filters → route params (strings only, empty ones left out). */
export function toParams(filters: BankFilters, start = 0): Record<string, string> {
  const params: Record<string, string> = { start: String(start) };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }
  return params;
}

/** Route params → filters; unknown difficulties are ignored. */
export function fromParams(params: Record<string, string | string[] | undefined>): {
  filters: BankFilters;
  start: number;
} {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const difficulty = DifficultySchema.safeParse(one('difficulty'));
  return {
    filters: {
      examId: one('examId'),
      sectionId: one('sectionId'),
      domainId: one('domainId'),
      difficulty: difficulty.success ? (difficulty.data as Difficulty) : undefined,
    },
    start: Math.max(0, Number(one('start') ?? 0) || 0),
  };
}
