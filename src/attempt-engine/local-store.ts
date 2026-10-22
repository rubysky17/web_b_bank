import type { AttemptEvent, Phase, SessionState } from './types';

/** The subset of MMKV this module needs (see `src/stores/storage.ts`). */
export type KeyValueStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => unknown;
};

/** One line per attempt kept on the device, for the "continue where you left off" cards. */
export type LocalAttemptSummary = {
  attemptId: string;
  examId: string;
  examTitle: string;
  phase: Phase;
  closing: SessionState['closing'];
  sectionOrder: number;
  sectionCount: number;
  answeredCount: number;
  sectionAnswered: number;
  sectionTotal: number;
  /** Section clock left in the current section, as of the last save. */
  remainingMs: number | null;
  totalQuestions: number;
  updatedAt: number;
};

/** Where one user's attempts are kept: every key starts with it, so accounts never mix. */
export const attemptPrefix = (userId: string) => `u:${userId}:`;

/**
 * Sectioned attempts on the device, under `prefix` (one user's; see `attemptPrefix`). Small keys
 * written synchronously (MMKV), so whatever the user did survives an app kill:
 * - `attempt:index`: summaries of the attempts kept here;
 * - `attempt:<id>:snapshot`: the questions as received when the attempt started (written once);
 * - `attempt:<id>:state`: the session state after the last event;
 * - `attempt:<id>:clock`: the section clock, checkpointed every second;
 * - `attempt:<id>:event:<seq>`: events not yet acknowledged by the server, and
 *   `attempt:<id>:acked`: the highest seq the server acknowledged.
 */
export function createLocalStore(storage: KeyValueStorage, prefix = '') {
  const read = <T>(key: string): T | null => readJson<T>(storage, prefix + key);
  const write = (key: string, value: unknown) => storage.set(prefix + key, JSON.stringify(value));
  const k = (id: string, part: string) => `attempt:${id}:${part}`;
  const INDEX = 'attempt:index';

  const readIndex = () => read<LocalAttemptSummary[]>(INDEX) ?? [];

  return {
    listAttempts: readIndex,

    findForExam: (examId: string) =>
      readIndex().find((a) => a.examId === examId && a.closing === null) ?? null,

    hasSession: (attemptId: string) =>
      storage.getString(prefix + k(attemptId, 'state')) !== undefined,

    loadSnapshot: <T>(attemptId: string) => read<T>(k(attemptId, 'snapshot')),
    saveSnapshot: (attemptId: string, snapshot: unknown) =>
      write(k(attemptId, 'snapshot'), snapshot),

    loadState: (attemptId: string) => read<SessionState>(k(attemptId, 'state')),
    saveState(state: SessionState, summary: LocalAttemptSummary) {
      write(k(state.attemptId, 'state'), state);
      write(INDEX, [summary, ...readIndex().filter((a) => a.attemptId !== state.attemptId)]);
    },

    loadClock: (attemptId: string) =>
      read<{ sectionOrder: number; usedMs: number }>(k(attemptId, 'clock')),
    saveClock: (attemptId: string, sectionOrder: number, usedMs: number) =>
      write(k(attemptId, 'clock'), { sectionOrder, usedMs }),

    appendEvent: (event: AttemptEvent) => write(k(event.attemptId, `event:${event.seq}`), event),

    ackedSeq: (attemptId: string) => read<number>(k(attemptId, 'acked')) ?? 0,

    /** Events after the acknowledged ones, in order, at most `limit`. */
    pendingEvents(attemptId: string, lastSeq: number, limit: number): AttemptEvent[] {
      const events: AttemptEvent[] = [];
      for (let seq = this.ackedSeq(attemptId) + 1; seq <= lastSeq && events.length < limit; seq++) {
        const event = read<AttemptEvent>(k(attemptId, `event:${seq}`));
        if (!event) break;
        events.push(event);
      }
      return events;
    },

    acknowledge(attemptId: string, upToSeq: number) {
      const from = this.ackedSeq(attemptId);
      for (let seq = from + 1; seq <= upToSeq; seq++) {
        storage.remove(prefix + k(attemptId, `event:${seq}`));
      }
      if (upToSeq > from) write(k(attemptId, 'acked'), upToSeq);
    },

    /** Forgets an attempt once the server has all of it (submitted or abandoned there). */
    remove(attemptId: string) {
      const state = read<SessionState>(k(attemptId, 'state'));
      const from = this.ackedSeq(attemptId);
      for (let seq = from + 1; seq <= (state?.lastSeq ?? from); seq++) {
        storage.remove(prefix + k(attemptId, `event:${seq}`));
      }
      for (const part of ['snapshot', 'state', 'clock', 'acked'])
        storage.remove(prefix + k(attemptId, part));
      write(
        INDEX,
        readIndex().filter((a) => a.attemptId !== attemptId),
      );
    },

    /** Forgets every attempt kept under this prefix (account deleted). */
    clear() {
      for (const { attemptId } of readIndex()) this.remove(attemptId);
      storage.remove(prefix + INDEX);
    },
  };
}

export type LocalStore = ReturnType<typeof createLocalStore>;

function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  const raw = storage.getString(key);
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Attempts saved before keys were per user had no owner: moves them under `prefix` (the first user
 * to sign in after the update). If they were someone else's, the server refuses them on the next
 * sync and they are dropped. Returns how many attempts were moved.
 */
export function adoptUnownedAttempts(storage: KeyValueStorage, prefix: string): number {
  const index = readJson<LocalAttemptSummary[]>(storage, 'attempt:index');
  if (!index) return 0;
  const move = (key: string) => {
    const value = storage.getString(key);
    if (value === undefined) return;
    storage.set(prefix + key, value);
    storage.remove(key);
  };
  const theirs = readJson<LocalAttemptSummary[]>(storage, `${prefix}attempt:index`) ?? [];
  for (const { attemptId } of index) {
    const state = readJson<SessionState>(storage, `attempt:${attemptId}:state`);
    const acked = readJson<number>(storage, `attempt:${attemptId}:acked`) ?? 0;
    for (let seq = acked + 1; seq <= (state?.lastSeq ?? acked); seq++) {
      move(`attempt:${attemptId}:event:${seq}`);
    }
    for (const part of ['snapshot', 'state', 'clock', 'acked'])
      move(`attempt:${attemptId}:${part}`);
  }
  const ids = new Set(index.map((a) => a.attemptId));
  storage.set(
    `${prefix}attempt:index`,
    JSON.stringify([...index, ...theirs.filter((a) => !ids.has(a.attemptId))]),
  );
  storage.remove('attempt:index');
  return index.length;
}
