import { onlineManager } from '@tanstack/react-query';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import { queryClient } from '@/providers/query-client';
import {
  attemptsOwner,
  forgetSession,
  getSession,
  localAttempts,
  replaceSession,
  useAttemptSessionsStore,
} from '@/stores/attempt-sessions';
import { useSyncStatusStore } from '@/stores/sync-status-store';

import { AttemptResultSchema, AttemptViewSchema } from './attempts';
import { api } from './client';
import { toApiError } from './errors';
import { queryKeys } from './query-keys';

const log = createLogger('attempt-sync');

/** Server limits per upload. */
const MAX_EVENTS = 500;
const MAX_QUESTIONS = 500;
/** While an attempt has something to upload, try again this often. */
const RETRY_EVERY_MS = 30_000;
/** After the user acts, upload this soon, so another device can go on from there. */
const UPLOAD_AFTER_MS = 2_000;

const SyncResultSchema = z.object({
  attemptId: z.string(),
  ackedSeq: z.number(),
  applied: z.boolean(),
});

/**
 * - SYNCED: the server has everything; the attempt is still open.
 * - DONE: submitted or abandoned on the server; the device forgot it (the result can be read).
 * - CLOSED: the server had already closed it (e.g. started over on another device).
 * - MOVED: another device went on with it; the device copy now is the server's (still open).
 * - OFFLINE: nothing could be sent; the data stays on the device and is retried later (also when
 *   the user signed out meanwhile: the attempt waits for them under their own keys).
 */
export type SyncOutcome = 'SYNCED' | 'DONE' | 'CLOSED' | 'MOVED' | 'OFFLINE';

const running = new Map<string, Promise<SyncOutcome>>();

/**
 * Uploads what the device recorded for a sectioned attempt: events in seq order (at most 500 per
 * request) with the current state, then submits or abandons it on the server when the user did.
 * One upload at a time per attempt; calling it again while one runs returns the same promise.
 */
export function syncAttempt(attemptId: string): Promise<SyncOutcome> {
  let task = running.get(attemptId);
  if (!task) {
    task = run(attemptId).finally(() => running.delete(attemptId));
    running.set(attemptId, task);
  }
  return task;
}

async function run(attemptId: string): Promise<SyncOutcome> {
  // The user the attempt belongs to: if another one signs in meanwhile, nothing is applied.
  const owner = attemptsOwner();
  const store = localAttempts();
  const isOwnerStill = () => owner !== null && attemptsOwner() === owner;
  if (!owner) return 'OFFLINE';
  try {
    for (;;) {
      const session = getSession(attemptId);
      if (!session) return 'DONE';
      const { state } = session;
      const ackedBefore = store.ackedSeq(attemptId);
      const events = store.pendingEvents(attemptId, state.lastSeq, MAX_EVENTS);
      const questions = Object.keys(state.dirty)
        .slice(0, MAX_QUESTIONS)
        .flatMap((id) => {
          const q = state.questions[id];
          if (!q) return [];
          return [
            {
              attemptQuestionId: q.id,
              response: (q.response ?? null) as Record<string, unknown> | null,
              firstResponse: (q.firstResponse ?? null) as Record<string, unknown> | null,
              flagged: q.flagged,
              everFlagged: q.everFlagged,
              confidence: q.confidence,
              eliminatedOptionIds: q.eliminated,
              dwellMs: q.dwellMs,
              timeToFirstAnswerMs: q.timeToFirstAnswerMs,
              timeToFinalAnswerMs: q.timeToFinalAnswerMs,
              visitCount: q.visitCount,
              answerChangeCount: q.answerChangeCount,
              eliminationCount: q.eliminationCount,
            },
          ];
        });

      const result = await api
        .post(`attempts/${attemptId}/sync`, {
          json: {
            lastSeq: state.lastSeq,
            phase: state.phase,
            currentSectionOrder: state.currentSectionOrder,
            events: events.map(({ attemptId: _attemptId, ...event }) => event),
            sections: session.sectionsForSync().map((s) => ({
              sectionOrder: s.order,
              usedMs: Math.round(s.usedMs),
              status: s.status,
              startedAt: s.startedAt,
              endedAt: s.endedAt,
              endReason: s.endReason,
              breakTakenMs: s.breakTakenMs,
              breakSkipped: s.breakSkipped,
            })),
            questions,
          },
        })
        .json(SyncResultSchema);

      // Events are acknowledged in the owner's own keys (`store`) even after a switch.
      store.acknowledge(attemptId, result.ackedSeq);
      if (!isOwnerStill()) return 'OFFLINE';
      // A timestamp to show, not a duration: Date.now() is fine here.
      useSyncStatusStore.getState().markSynced(Date.now());
      if (result.applied) session.markSynced(state.lastSeq);
      useAttemptSessionsStore.setState({ index: store.listAttempts() });

      if (result.ackedSeq < session.state.lastSeq) {
        // More events than one request takes, or new ones recorded meanwhile: keep going, unless
        // the server took nothing (a gap it cannot fill): the next scheduled sync tries again.
        const recordedMeanwhile = session.state.lastSeq > state.lastSeq;
        if (result.ackedSeq <= ackedBefore && !recordedMeanwhile) return 'SYNCED';
        continue;
      }
      if (session.state.closing === 'SUBMIT') return await submit(attemptId);
      if (session.state.closing === 'ABANDON') return await abandon(attemptId);
      return 'SYNCED';
    }
  } catch (error) {
    const apiError = toApiError(error);
    if (!isOwnerStill()) return 'OFFLINE';
    if (apiError.serverCode === 'ATTEMPT_CLOSED' || apiError.status === 404) {
      // 404: the attempt is not this user's (kept from before attempts were stored per user).
      log.warn('attempt closed or unknown on the server; dropping the device copy', attemptId);
      forgetSession(attemptId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all });
      return 'CLOSED';
    }
    if (apiError.serverCode === 'ATTEMPT_CONTINUED_ELSEWHERE') {
      return await reload(attemptId).catch((): SyncOutcome => 'OFFLINE');
    }
    if (apiError.code === 'network' || apiError.code === 'timeout') return 'OFFLINE';
    log.warn('sync failed', attemptId, error);
    return 'OFFLINE';
  }
}

/**
 * Another device went on with the attempt (started on the computer, continued on the phone): the
 * server has the newer copy. It replaces the one kept here, or the attempt is forgotten if it was
 * closed meanwhile. Failing to read it (offline) keeps the device copy until the next sync.
 */
async function reload(attemptId: string): Promise<SyncOutcome> {
  log.warn('attempt continued on another device; reloading it from the server', attemptId);
  const view = await api.get(`attempts/${attemptId}`).json(AttemptViewSchema);
  void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all });
  if (view.mode === 'SECTIONED' && view.status === 'IN_PROGRESS') {
    replaceSession(view);
    return 'MOVED';
  }
  forgetSession(attemptId);
  return 'CLOSED';
}

async function submit(attemptId: string): Promise<SyncOutcome> {
  const result = await api.post(`attempts/${attemptId}/submit`).json(AttemptResultSchema);
  queryClient.setQueryData(queryKeys.attempts.result(attemptId), result);
  finish(attemptId, result.examId);
  return 'DONE';
}

async function abandon(attemptId: string): Promise<SyncOutcome> {
  const examId = getSession(attemptId)?.state.examId;
  await api.post(`attempts/${attemptId}/abandon`).json(z.object({ status: z.string() }));
  finish(attemptId, examId);
  return 'DONE';
}

function finish(attemptId: string, examId: string | undefined) {
  forgetSession(attemptId);
  void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
  if (examId)
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalog.detail(examId),
    });
}

/** "Sync now": uploads every attempt kept on the device and waits for the outcomes. */
export function syncAllAttemptsNow(): Promise<SyncOutcome[]> {
  return Promise.all(
    localAttempts()
      .listAttempts()
      .map(({ attemptId }) => syncAttempt(attemptId)),
  );
}

/**
 * Attempts the server doesn't fully have yet: events not acknowledged, or a submit / abandon still
 * to send. (Every attempt still on the device counts until the server has all of it.)
 */
export function pendingUploadCount(): number {
  const store = localAttempts();
  return store.listAttempts().filter((summary) => {
    if (summary.closing !== null) return true;
    const state = store.loadState(summary.attemptId);
    return state !== null && state.lastSeq > store.ackedSeq(summary.attemptId);
  }).length;
}

/** Uploads every attempt kept on the device. */
export function syncAllAttempts() {
  if (!onlineManager.isOnline() || !attemptsOwner()) return;
  for (const { attemptId } of localAttempts().listAttempts()) void syncAttempt(attemptId);
}

const uploadTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Uploads an attempt the user just acted on: at once when leaving the app, else a bit later. */
function uploadSoon(attemptId: string, now: boolean) {
  clearTimeout(uploadTimers.get(attemptId));
  const upload = () => {
    uploadTimers.delete(attemptId);
    if (onlineManager.isOnline()) void syncAttempt(attemptId);
  };
  if (now) upload();
  else uploadTimers.set(attemptId, setTimeout(upload, UPLOAD_AFTER_MS));
}

/** Calls `onRecorded` with every attempt that got new events (the store republishes after each). */
function onEventsRecorded(onRecorded: (attemptId: string) => void) {
  return useAttemptSessionsStore.subscribe((next, previous) => {
    for (const [attemptId, state] of Object.entries(next.states)) {
      if (state.lastSeq > (previous.states[attemptId]?.lastSeq ?? 0)) onRecorded(attemptId);
    }
  });
}

/**
 * Background upload: shortly after every action (at once while the tab is hidden), when the tab is
 * hidden or shown again (another device may have gone on meanwhile), when the connection comes
 * back, and every 30 s while something is waiting. Started once by the app providers.
 */
export function startAttemptSync() {
  syncAllAttempts();
  const unsubscribeOnline = onlineManager.subscribe((isOnline) => {
    if (isOnline) syncAllAttempts();
  });
  const unsubscribeEvents = onEventsRecorded((attemptId) => {
    uploadSoon(attemptId, document.visibilityState === 'hidden');
  });
  document.addEventListener('visibilitychange', syncAllAttempts);
  const timer = setInterval(syncAllAttempts, RETRY_EVERY_MS);
  return () => {
    unsubscribeOnline();
    unsubscribeEvents();
    document.removeEventListener('visibilitychange', syncAllAttempts);
    clearInterval(timer);
  };
}
