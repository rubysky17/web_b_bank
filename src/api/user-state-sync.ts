import { onlineManager } from '@tanstack/react-query';

import { createLogger } from '@/lib/logger';
import {
  applyUserStateSync,
  setUserStateSyncing,
  useUserStateStore,
} from '@/stores/user-state-store';
import { buildPush } from '@/user-state/merge';

import { toApiError } from './errors';
import { postUserStateSync } from './user-state';

const log = createLogger('user-state-sync');

/** Wait after a change on the device before uploading (answers often come in bursts). */
const UPLOAD_DELAY_MS = 1_000;
/** Requests per sync at most (pages and uploads). */
const MAX_ROUNDS = 5;
/** After a refusal (rate limit, server error), wait this long before trying again. */
const BACKOFF_MS = 60_000;
/** Server unreachable while changes wait: try again this often. */
const RETRY_MS = 30_000;

let running: Promise<void> | null = null;
let again = false;
let blockedUntil = 0;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Uploads the practice answers and settings changed on the device and pulls what changed on the
 * user's other devices. One sync at a time; calling it while one runs schedules another right after.
 */
export function syncUserState(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    setUserStateSyncing(false);
    if (again) {
      again = false;
      void syncUserState();
    }
  });
  return running;
}

/** "Sync now" from the UI: forget any back-off and sync right away. */
export function syncUserStateNow() {
  blockedUntil = 0;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = null;
  return syncUserState();
}

/** Sync a little later (after a burst of local changes). */
export function scheduleUserStateSync(delay = UPLOAD_DELAY_MS) {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    void syncUserState();
  }, delay);
}

async function run() {
  const userId = useUserStateStore.getState().userId;
  // A timestamp to compare with, not a duration: Date.now() is fine here.
  if (!userId || !onlineManager.isOnline() || Date.now() < blockedUntil) return;
  setUserStateSyncing(true);
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const state = useUserStateStore.getState();
      if (state.userId !== userId) return;
      const changes = buildPush(state);
      const result = await postUserStateSync({ cursor: state.cursor, changes });
      applyUserStateSync(userId, changes, result);

      const after = useUserStateStore.getState();
      const moreToUpload = after.userId === userId && Object.keys(after.dirty).length > 0;
      if (!result.hasMore && !moreToUpload) return;
    }
  } catch (error) {
    const apiError = toApiError(error);
    // The client already refreshed the session, or signed the user out.
    if (apiError.code === 'unauthorized') return;
    if (apiError.code === 'network' || apiError.code === 'timeout') {
      if (Object.keys(useUserStateStore.getState().dirty).length > 0) {
        scheduleUserStateSync(RETRY_MS);
      }
      return;
    }
    if (apiError.status !== 429) log.warn('sync failed', error);
    blockedUntil = Date.now() + BACKOFF_MS;
    scheduleUserStateSync(BACKOFF_MS + 1_000);
  }
}

/**
 * Uploads soon after every change on the device. The rest (sign-in, foreground, connection back,
 * changes made on other devices) is driven by `sync/coordinator.ts`. Started once by the app
 * providers.
 */
export function startUserStateSync() {
  return useUserStateStore.subscribe((state, previous) => {
    if (state.localVersion !== previous.localVersion) scheduleUserStateSync();
  });
}
