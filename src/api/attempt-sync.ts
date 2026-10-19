import { onlineManager } from '@tanstack/react-query';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import { queryClient } from '@/providers/query-client';
import {
  forgetSession,
  getSession,
  localAttempts,
  useAttemptSessionsStore,
} from '@/stores/attempt-sessions';
import { useSyncStatusStore } from '@/stores/sync-status-store';

import { AttemptResultSchema } from './attempts';
import { api } from './client';
import { toApiError } from './errors';
import { queryKeys } from './query-keys';

const log = createLogger('attempt-sync');

/** Server limits per upload. */
const MAX_EVENTS = 500;
const MAX_QUESTIONS = 500;
/** While an attempt has something to upload, try again this often. */
const RETRY_EVERY_MS = 30_000;

const SyncResultSchema = z.object({
  attemptId: z.string(),
  ackedSeq: z.number(),
  applied: z.boolean(),
});

/**
 * - SYNCED: the server has everything; the attempt is still open.
 * - DONE: submitted or abandoned on the server; the device forgot it (the result can be read).
 * - CLOSED: the server had already closed it (e.g. started over on another device).
 * - OFFLINE: nothing could be sent; the data stays on the device and is retried later.
 */
export type SyncOutcome = 'SYNCED' | 'DONE' | 'CLOSED' | 'OFFLINE';

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
  try {
    for (;;) {
      const session = getSession(attemptId);
      if (!session) return 'DONE';
      const { state } = session;
      const ackedBefore = localAttempts.ackedSeq(attemptId);
      const events = localAttempts.pendingEvents(attemptId, state.lastSeq, MAX_EVENTS);
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

      localAttempts.acknowledge(attemptId, result.ackedSeq);
      // A timestamp to show, not a duration: Date.now() is fine here.
      useSyncStatusStore.getState().markSynced(Date.now());
      if (result.applied) session.markSynced(state.lastSeq);
      useAttemptSessionsStore.setState({ index: localAttempts.listAttempts() });

      if (result.ackedSeq < session.state.lastSeq) {
        // More events than one request takes, or new ones recorded meanwhile: keep going, unless
        // the server took nothing (a gap it cannot fill): the next scheduled sync tries again.
        if (result.ackedSeq <= ackedBefore) return 'SYNCED';
        continue;
      }
      if (session.state.closing === 'SUBMIT') return await submit(attemptId);
      if (session.state.closing === 'ABANDON') return await abandon(attemptId);
      return 'SYNCED';
    }
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.serverCode === 'ATTEMPT_CLOSED') {
      log.warn('attempt closed on the server; dropping the device copy', attemptId);
      forgetSession(attemptId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.all });
      return 'CLOSED';
    }
    if (apiError.code === 'network' || apiError.code === 'timeout') return 'OFFLINE';
    log.warn('sync failed', attemptId, error);
    return 'OFFLINE';
  }
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
  if (examId) void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.detail(examId) });
}

/** "Sync now": uploads every attempt kept on the device and waits for the outcomes. */
export function syncAllAttemptsNow(): Promise<SyncOutcome[]> {
  return Promise.all(localAttempts.listAttempts().map(({ attemptId }) => syncAttempt(attemptId)));
}

/**
 * Attempts the server doesn't fully have yet: events not acknowledged, or a submit / abandon still
 * to send. (Every attempt still on the device counts until the server has all of it.)
 */
export function pendingUploadCount(): number {
  return localAttempts.listAttempts().filter((summary) => {
    if (summary.closing !== null) return true;
    const state = localAttempts.loadState(summary.attemptId);
    return state !== null && state.lastSeq > localAttempts.ackedSeq(summary.attemptId);
  }).length;
}

/** Uploads every attempt kept on the device. */
export function syncAllAttempts() {
  if (!onlineManager.isOnline()) return;
  for (const { attemptId } of localAttempts.listAttempts()) void syncAttempt(attemptId);
}

/**
 * Background upload: when the connection comes back, when the tab becomes visible again, and
 * every 30 s while something is waiting. Started once by the app providers.
 */
export function startAttemptSync() {
  syncAllAttempts();
  const unsubscribeOnline = onlineManager.subscribe((isOnline) => {
    if (isOnline) syncAllAttempts();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') syncAllAttempts();
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(syncAllAttempts, RETRY_EVERY_MS);
  return () => {
    unsubscribeOnline();
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(timer);
  };
}
