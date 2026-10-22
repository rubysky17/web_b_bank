import type { AttemptListItem } from '@/api/attempts';
import type { LocalAttemptSummary } from '@/attempt-engine/local-store';

import { continueItems } from './rows';

const local = (attemptId: string, patch: Partial<LocalAttemptSummary> = {}): LocalAttemptSummary =>
  ({
    attemptId,
    examId: 'e1',
    examTitle: `Local ${attemptId}`,
    phase: 'IN_SECTION',
    closing: null,
    sectionOrder: 2,
    answeredCount: 30,
    totalQuestions: 60,
    ...patch,
  }) as LocalAttemptSummary;

const server = (id: string, patch: Partial<AttemptListItem> = {}): AttemptListItem =>
  ({
    id,
    examId: 'e2',
    examTitle: `Server ${id}`,
    status: 'IN_PROGRESS',
    mode: 'SECTIONED',
    currentSectionOrder: 1,
    answeredCount: 12,
    totalQuestions: 60,
    ...patch,
  }) as AttemptListItem;

describe('continueItems', () => {
  it('keeps the device copies first, without the ones handed in or abandoned here', () => {
    const items = continueItems([local('a'), local('b', { closing: 'SUBMIT' })], undefined);
    expect(items).toEqual([
      {
        attemptId: 'a',
        examTitle: 'Local a',
        sectionOrder: 2,
        answeredCount: 30,
        totalQuestions: 60,
      },
    ]);
  });

  it('adds sectioned attempts in progress on another device', () => {
    const items = continueItems(
      [local('a')],
      [
        server('a', { answeredCount: 99 }),
        server('c'),
        server('d', { mode: 'LEGACY' }),
        server('e', { status: 'SUBMITTED' }),
      ],
    );
    expect(items.map((i) => [i.attemptId, i.answeredCount])).toEqual([
      ['a', 30],
      ['c', 12],
    ]);
  });

  it('does not bring back an attempt abandoned here but not uploaded yet', () => {
    const items = continueItems([local('a', { closing: 'ABANDON' })], [server('a')]);
    expect(items).toEqual([]);
  });
});
