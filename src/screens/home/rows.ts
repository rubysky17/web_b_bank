import type { AttemptListItem } from '@/api/attempts';
import type { LocalAttemptSummary } from '@/attempt-engine/local-store';

/** One "continue" card. */
export type ContinueItem = {
  attemptId: string;
  examTitle: string;
  sectionOrder: number;
  answeredCount: number;
  totalQuestions: number;
};

/**
 * Unfinished sectioned attempts to continue: the ones kept on this device first (newest first, shown
 * offline too), then those in progress on the server that this device doesn't keep (started or
 * continued on another device). Handed in or abandoned here but not uploaded yet: not shown.
 */
export function continueItems(
  local: LocalAttemptSummary[],
  server: AttemptListItem[] | undefined,
): ContinueItem[] {
  const kept = new Set(local.map((a) => a.attemptId));
  const items: ContinueItem[] = local
    .filter((a) => a.closing === null)
    .map(({ attemptId, examTitle, sectionOrder, answeredCount, totalQuestions }) => ({
      attemptId,
      examTitle,
      sectionOrder,
      answeredCount,
      totalQuestions,
    }));
  for (const a of server ?? []) {
    if (a.mode !== 'SECTIONED' || a.status !== 'IN_PROGRESS' || kept.has(a.id)) continue;
    items.push({
      attemptId: a.id,
      examTitle: a.examTitle,
      sectionOrder: a.currentSectionOrder ?? 1,
      answeredCount: a.answeredCount,
      totalQuestions: a.totalQuestions,
    });
  }
  return items;
}
