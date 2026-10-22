import { adoptUnownedAttempts, attemptPrefix, createLocalStore } from './local-store';
import type { LocalAttemptSummary } from './local-store';
import type { AttemptEvent, SessionState } from './types';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
    },
    remove: (key: string) => values.delete(key),
  };
}

const summary = (attemptId: string): LocalAttemptSummary => ({
  attemptId,
  examId: 'exam',
  examTitle: 'PMP',
  phase: 'IN_SECTION',
  closing: null,
  sectionOrder: 1,
  sectionCount: 2,
  answeredCount: 0,
  sectionAnswered: 0,
  sectionTotal: 10,
  remainingMs: null,
  totalQuestions: 20,
  updatedAt: 1,
});

const state = (attemptId: string, lastSeq: number) =>
  ({ attemptId, lastSeq }) as unknown as SessionState;

const event = (attemptId: string, seq: number) => ({ attemptId, seq }) as unknown as AttemptEvent;

describe('attempt local store', () => {
  it('keeps each user’s attempts apart', () => {
    const storage = memoryStorage();
    const alice = createLocalStore(storage, attemptPrefix('alice'));
    const bob = createLocalStore(storage, attemptPrefix('bob'));
    alice.saveState(state('a1', 0), summary('a1'));

    expect(alice.listAttempts().map((a) => a.attemptId)).toEqual(['a1']);
    expect(bob.listAttempts()).toEqual([]);
    expect(bob.hasSession('a1')).toBe(false);

    alice.clear();
    expect(storage.values.size).toBe(0);
    expect(alice.listAttempts()).toEqual([]);
  });

  it('gives attempts saved before keys were per user to the first user', () => {
    const storage = memoryStorage();
    const unowned = createLocalStore(storage);
    unowned.saveState(state('a1', 2), summary('a1'));
    unowned.saveSnapshot('a1', { questions: [] });
    unowned.appendEvent(event('a1', 1));
    unowned.appendEvent(event('a1', 2));
    unowned.acknowledge('a1', 1);

    expect(adoptUnownedAttempts(storage, attemptPrefix('alice'))).toBe(1);
    const alice = createLocalStore(storage, attemptPrefix('alice'));
    expect(alice.listAttempts().map((a) => a.attemptId)).toEqual(['a1']);
    expect(alice.loadSnapshot('a1')).toEqual({ questions: [] });
    expect(alice.pendingEvents('a1', 2, 10)).toEqual([event('a1', 2)]);
    expect([...storage.values.keys()].every((key) => key.startsWith('u:alice:'))).toBe(true);

    expect(adoptUnownedAttempts(storage, attemptPrefix('bob'))).toBe(0);
  });
});
