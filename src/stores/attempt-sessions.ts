import { create } from 'zustand';

import type { AttemptQuestion, AttemptView } from '@/api/attempts';
import { createLocalStore, type LocalAttemptSummary } from '@/attempt-engine/local-store';
import { sessionFromServer } from '@/attempt-engine/reducer';
import { AttemptSession, type SessionDeps } from '@/attempt-engine/session';
import type { EventInput, SessionState } from '@/attempt-engine/types';
import { uuidv7 } from '@/attempt-engine/uuidv7';

import { storage } from './storage';

/**
 * Sectioned attempts kept on the device (they work offline; `src/api/attempt-sync.ts` uploads them).
 * The sessions live here; the zustand store only republishes their state so screens re-render.
 * Not `persist`ed: each session writes its own small MMKV keys (see `local-store.ts`).
 */
export const localAttempts = createLocalStore(storage);

const deps: SessionDeps = {
  store: localAttempts,
  // Monotonic: the device clock can be changed by the user, this cannot.
  monoNow: () => performance.now(),
  wallNow: () => Date.now(),
  newId: () => uuidv7(),
};

/** What the test screen needs to show questions offline: kept with the session. */
export type AttemptSnapshot = {
  sections: { order: number; title: string; questionCount: number }[];
  questions: AttemptQuestion[];
};

type AttemptSessionsStore = {
  states: Record<string, SessionState>;
  index: LocalAttemptSummary[];
};

export const useAttemptSessionsStore = create<AttemptSessionsStore>(() => ({
  states: {},
  index: localAttempts.listAttempts(),
}));

const sessions = new Map<string, AttemptSession>();

function publish(session: AttemptSession | null, attemptId: string) {
  useAttemptSessionsStore.setState((s) => {
    const states = { ...s.states };
    if (session) states[attemptId] = session.state;
    else delete states[attemptId];
    return { states, index: localAttempts.listAttempts() };
  });
}

/**
 * The attempt's session if the device has it. Safe to call during render: it never publishes (the
 * first action does), and `useSessionState` reads the session directly until then.
 */
export function getSession(attemptId: string): AttemptSession | null {
  let session = sessions.get(attemptId) ?? null;
  if (!session) {
    session = AttemptSession.open(attemptId, deps);
    if (session) sessions.set(attemptId, session);
  }
  return session;
}

export const hasLocalSession = (attemptId: string) =>
  sessions.has(attemptId) || localAttempts.hasSession(attemptId);

/** Starts keeping a sectioned attempt on the device, from the server's view of it. */
export function sessionFromView(view: AttemptView): AttemptSession {
  const existing = getSession(view.id);
  if (existing) return existing;
  const state = sessionFromServer({
    attemptId: view.id,
    examId: view.examId,
    examTitle: view.examTitle,
    breakMinutes: view.breakMinutes,
    phase: view.phase,
    currentSectionOrder: view.currentSectionOrder,
    syncedSeq: view.syncedSeq,
    sections: view.sections.map((section) => ({
      order: section.order,
      title: section.title,
      budgetMs: section.clock?.budgetMs ?? 0,
      usedMs: section.clock?.usedMs ?? 0,
      status: section.clock?.status ?? 'LOCKED',
      startedAt: section.clock?.startedAt ? Date.parse(section.clock.startedAt) : null,
      endedAt: section.clock?.endedAt ? Date.parse(section.clock.endedAt) : null,
      endReason: section.clock?.endReason ?? null,
      breakTakenMs: section.clock?.breakTakenMs ?? null,
      breakSkipped: section.clock?.breakSkipped ?? null,
    })),
    questions: view.questions.map((q) => ({
      id: q.id,
      sectionOrder: q.sectionOrder,
      response: q.response ?? null,
      firstResponse: q.firstResponse ?? null,
      flagged: q.flagged,
      everFlagged: q.everFlagged ?? q.flagged,
      confidence: q.confidence,
      eliminated: q.eliminatedOptionIds,
      dwellMs: q.dwellMs ?? 0,
      timeToFirstAnswerMs: q.timeToFirstAnswerMs,
      timeToFinalAnswerMs: q.timeToFinalAnswerMs,
      visitCount: q.visitCount ?? 0,
      answerChangeCount: q.answerChangeCount ?? 0,
      eliminationCount: q.eliminationCount ?? 0,
    })),
  });
  const snapshot: AttemptSnapshot = {
    sections: view.sections.map(({ order, title, questionCount }) => ({
      order,
      title,
      questionCount,
    })),
    questions: view.questions,
  };
  const session = AttemptSession.create(state, snapshot, deps);
  sessions.set(view.id, session);
  return session;
}

/**
 * Another device went on with the attempt: drop the copy kept here (what it recorded since can no
 * longer be uploaded) and start over from the server's, so the open screen shows where it is now.
 */
export function replaceSession(view: AttemptView): AttemptSession {
  sessions.delete(view.id);
  localAttempts.remove(view.id);
  const session = sessionFromView(view);
  publish(session, view.id);
  return session;
}

export const loadSnapshot = (attemptId: string) =>
  localAttempts.loadSnapshot<AttemptSnapshot>(attemptId);

/** Records a user action on the attempt; false when the rules refuse it. */
export function dispatchAttempt(attemptId: string, input: EventInput): boolean {
  const session = getSession(attemptId);
  if (!session || !session.dispatch(input)) return false;
  publish(session, attemptId);
  return true;
}

/** Runs `fn` on the session and republishes its state (pause, resume, tick…). */
export function withSession<T>(attemptId: string, fn: (session: AttemptSession) => T): T | null {
  const session = getSession(attemptId);
  if (!session) return null;
  const before = session.state;
  const result = fn(session);
  if (session.state !== before) publish(session, attemptId);
  return result;
}

/** The server has everything: forget the attempt on the device. */
export function forgetSession(attemptId: string) {
  sessions.delete(attemptId);
  localAttempts.remove(attemptId);
  publish(null, attemptId);
}

export function useSessionState(attemptId: string): SessionState | undefined {
  const published = useAttemptSessionsStore((s) => s.states[attemptId]);
  return published ?? getSession(attemptId)?.state;
}

/** The unfinished attempt on this exam kept on the device, for the "continue" card. */
export const useLocalAttemptForExam = (examId: string) =>
  useAttemptSessionsStore(
    (s) => s.index.find((a) => a.examId === examId && a.closing === null) ?? null,
  );

export const useLocalAttempts = () => useAttemptSessionsStore((s) => s.index);
