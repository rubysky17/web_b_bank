import { onlineManager } from '@tanstack/react-query';

import { createLogger } from '@/lib/logger';
import { queryClient } from '@/providers/query-client';
import { storage } from '@/stores/storage';
import { useSyncStatusStore } from '@/stores/sync-status-store';

import {
  type AnswerChange,
  applyAnswerChange,
  type QueuedChange,
  queueChange,
} from './attempt-state';
import { api } from './client';
import { toApiError } from './errors';
import { queryKeys } from './query-keys';

const log = createLogger('legacy-outbox');

/** Server limit per PATCH /attempts/:id/answers. */
const MAX_ANSWERS = 500;

/** attemptId → attemptQuestionId → the change waiting to be saved. */
type Outbox = Record<string, Record<string, QueuedChange>>;

/**
 * - SENT: the server has every change (or there was none).
 * - CLOSED: the server refuses the attempt (submitted, expired, not this user's): changes dropped.
 * - OFFLINE: kept on the device, sent later.
 */
export type FlushOutcome = 'SENT' | 'CLOSED' | 'OFFLINE';

/** Each user's waiting changes under their own key, so accounts never mix. */
const keyOf = (userId: string) => `u:${userId}:legacy-outbox`;

let owner: string | null = null;

function read(userId: string): Outbox {
  const raw = storage.getString(keyOf(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Outbox;
  } catch {
    return {};
  }
}

function write(userId: string, outbox: Outbox) {
  if (Object.keys(outbox).length === 0) storage.remove(keyOf(userId));
  else storage.set(keyOf(userId), JSON.stringify(outbox));
}

/** Loads the waiting changes of the signed-in user (null: signed out). */
export function activateLegacyOutboxUser(userId: string | null) {
  owner = userId;
}

/** Forgets a user's waiting changes on this device (account deleted). */
export function clearLegacyOutboxUser(userId: string) {
  storage.remove(keyOf(userId));
}

/** Saves an answer change on the device first; `flushLegacyAttempt` sends it. */
export function enqueueAnswer(attemptId: string, change: AnswerChange) {
  if (!owner) return;
  const outbox = read(owner);
  const forAttempt = outbox[attemptId] ?? {};
  forAttempt[change.attemptQuestionId] = queueChange(
    forAttempt[change.attemptQuestionId],
    change,
    Date.now(),
  );
  write(owner, { ...outbox, [attemptId]: forAttempt });
}

export function pendingAnswers(attemptId: string): QueuedChange[] {
  return owner ? Object.values(read(owner)[attemptId] ?? {}) : [];
}

/** The attempt as the server sent it, with the changes still waiting on the device on top. */
export function withPendingAnswers<V extends Parameters<typeof applyAnswerChange>[0]>(
  attemptId: string,
  view: V,
): V {
  return pendingAnswers(attemptId).reduce<V>(
    (current, change) => applyAnswerChange(current, change),
    view,
  );
}

const running = new Map<string, Promise<FlushOutcome>>();

/** Sends what waits for one attempt (one flush at a time per attempt). */
export function flushLegacyAttempt(attemptId: string): Promise<FlushOutcome> {
  let task = running.get(attemptId);
  if (!task) {
    task = flush(attemptId).finally(() => running.delete(attemptId));
    running.set(attemptId, task);
  }
  return task;
}

async function flush(attemptId: string): Promise<FlushOutcome> {
  const userId = owner;
  if (!userId) return 'OFFLINE';
  for (;;) {
    const sent = Object.values(read(userId)[attemptId] ?? {}).slice(0, MAX_ANSWERS);
    if (sent.length === 0) return 'SENT';
    if (!onlineManager.isOnline()) return 'OFFLINE';
    try {
      await api.patch(`attempts/${attemptId}/answers`, { json: { answers: sent } });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code !== 'http' || (apiError.status ?? 500) >= 500 || apiError.status === 429) {
        return 'OFFLINE';
      }
      // Refused for good (closed, expired, not found, invalid): retrying would never succeed.
      log.warn('answers refused; dropping them', attemptId, apiError.serverCode);
      const outbox = read(userId);
      delete outbox[attemptId];
      write(userId, outbox);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempts.detail(attemptId) });
      throw apiError;
    }
    // Drop what the server has; a change made meanwhile (newer version) stays for the next round.
    const outbox = read(userId);
    const forAttempt = outbox[attemptId] ?? {};
    for (const change of sent) {
      const current = forAttempt[change.attemptQuestionId];
      if (current?.clientUpdatedAt === change.clientUpdatedAt) {
        delete forAttempt[change.attemptQuestionId];
      } else if (current?.timeSpentMs) {
        // The newer change still holds the time just sent: the server must not add it twice.
        const timeSpentMs = current.timeSpentMs - (change.timeSpentMs ?? 0);
        forAttempt[change.attemptQuestionId] = {
          ...current,
          timeSpentMs: Math.max(0, timeSpentMs),
        };
      }
    }
    if (Object.keys(forAttempt).length === 0) delete outbox[attemptId];
    write(userId, outbox);
    if (userId === owner) useSyncStatusStore.getState().markSynced(Date.now());
  }
}

/** Sends every waiting change of the signed-in user. */
export function flushLegacyOutbox(): Promise<FlushOutcome[]> {
  if (!owner) return Promise.resolve([]);
  return Promise.all(
    Object.keys(read(owner)).map((attemptId) =>
      flushLegacyAttempt(attemptId).catch((): FlushOutcome => 'CLOSED'),
    ),
  );
}

/** LEGACY attempts with answers still waiting on the device. */
export const pendingLegacyCount = () => (owner ? Object.keys(read(owner)).length : 0);
