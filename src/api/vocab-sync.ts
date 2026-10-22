import { onlineManager } from '@tanstack/react-query';

import { createLogger } from '@/lib/logger';
import {
  applyVocabSync,
  flushVocab,
  reloadVocabFromStorage,
  setVocabSyncIssue,
  setVocabSyncing,
  useVocabStore,
} from '@/stores/vocab-store';
import { vocabKeys } from '@/vocab/local-store';
import { buildPush } from '@/vocab/merge';

import { toApiError } from './errors';
import { postVocabSync } from './vocab';

const log = createLogger('vocab-sync');

/** Wait after a change on the device before uploading (notes often come in bursts). */
const UPLOAD_DELAY_MS = 1_500;
/** Requests per sync at most (pages, uploads and translation rounds). */
const MAX_ROUNDS = 5;
/** After a refusal (rate limit, server error), wait this long before trying again. */
const BACKOFF_MS = 60_000;
/** Server unreachable while changes wait: try again this often. */
const RETRY_MS = 30_000;
/** No translation engine answered (rate limit, outage): ask again after these delays. */
const TRANSLATION_RETRY_MS = [30_000, 120_000, 600_000];

let running: Promise<void> | null = null;
let again = false;
let blockedUntil = 0;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;
let translationRetries = 0;

/**
 * Uploads the notes changed on the device and pulls what changed elsewhere (other devices, new
 * translations). One sync at a time; calling it while one runs schedules another right after.
 */
export function syncVocab(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    setVocabSyncing(false);
    if (again) {
      again = false;
      void syncVocab();
    }
  });
  return running;
}

/** "Try again" from the UI: forget any back-off and sync right away. */
export function retryVocabSyncNow() {
  blockedUntil = 0;
  translationRetries = 0;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = null;
  return syncVocab();
}

/** Sync a little later (after a burst of local changes). */
export function scheduleVocabSync(delay = UPLOAD_DELAY_MS) {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    void syncVocab();
  }, delay);
}

function retryTranslationsLater() {
  const delay = TRANSLATION_RETRY_MS[translationRetries];
  // Never push back an upload that is already scheduled.
  if (delay === undefined || uploadTimer) return;
  translationRetries += 1;
  scheduleVocabSync(delay);
}

async function run() {
  const userId = useVocabStore.getState().userId;
  // A timestamp to compare with, not a duration: Date.now() is fine here.
  if (!userId || !onlineManager.isOnline() || Date.now() < blockedUntil) return;
  setVocabSyncing(true);
  let lastPending = Number.POSITIVE_INFINITY;
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const state = useVocabStore.getState();
      if (state.userId !== userId) return;
      const changes = buildPush(state);
      const result = await postVocabSync({ cursor: state.cursor, changes });
      applyVocabSync(userId, changes, result);
      setVocabSyncIssue(result.pending > 0 && result.translateUnavailable ? 'translator' : null);

      const after = useVocabStore.getState();
      const moreToUpload = after.userId === userId && Object.keys(after.dirty).length > 0;
      // Keep going while translations make progress; they arrive five per request.
      const translating =
        result.pending > 0 && !result.translateUnavailable && result.pending < lastPending;
      lastPending = result.pending;
      if (!result.hasMore && !moreToUpload && !translating) {
        if (result.pending > 0 && result.translateUnavailable) retryTranslationsLater();
        else translationRetries = 0;
        return;
      }
    }
  } catch (error) {
    const apiError = toApiError(error);
    // The client already refreshed the session, or signed the user out.
    if (apiError.code === 'unauthorized') return;
    // Online but no usable answer (server down, endpoint missing, refused): say so in the UI
    // rather than "Translating…" forever.
    setVocabSyncIssue('server');
    if (apiError.code === 'network' || apiError.code === 'timeout') {
      if (Object.keys(useVocabStore.getState().dirty).length > 0) scheduleVocabSync(RETRY_MS);
      return;
    }
    if (apiError.status !== 429) log.warn('sync failed', error);
    blockedUntil = Date.now() + BACKOFF_MS;
    scheduleVocabSync(BACKOFF_MS + 1_000);
  }
}

/**
 * Uploads soon after every change in this tab, saves to the browser when the tab is hidden, and
 * merges changes saved by another tab. Loading the signed-in user's notes and pulling (sign-in,
 * tab shown again, connection back, changes made on other devices) is driven by
 * `sync/coordinator.ts`. Started once by the app providers.
 */
export function startVocabSync() {
  const unsubscribeLocal = useVocabStore.subscribe((state, previous) => {
    if (state.localVersion !== previous.localVersion) scheduleVocabSync();
  });
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushVocab();
  };
  const onOtherTab = (event: StorageEvent) => {
    const userId = useVocabStore.getState().userId;
    if (!userId || !event.key) return;
    const keys = vocabKeys(userId);
    // `stores/storage.ts` prefixes every key.
    if (event.key.endsWith(keys.entries) || event.key.endsWith(keys.meta)) {
      reloadVocabFromStorage();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flushVocab);
  window.addEventListener('storage', onOtherTab);
  return () => {
    unsubscribeLocal();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flushVocab);
    window.removeEventListener('storage', onOtherTab);
    flushVocab();
  };
}
