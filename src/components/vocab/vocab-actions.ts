import { onlineManager } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { scheduleVocabSync } from '@/api/vocab-sync';
import {
  deleteVocabNote,
  restoreVocabNote,
  retryVocabTranslation,
  setVocabMeaning,
  useVocabStore,
} from '@/stores/vocab-store';

/** Upload soon after a change the user waits for (a new note, a retry): its translation comes back. */
const SOON_MS = 300;

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

export function useIsOnline() {
  return useSyncExternalStore(subscribeOnline, isOnline);
}

/** Deletes a note and offers to bring it back from the toast. */
export function deleteNoteWithUndo(key: string, t: TFunction) {
  const snapshot = deleteVocabNote(key);
  if (!snapshot) return;
  toast(t('vocab.deleted', { term: snapshot.term }), {
    action: { label: t('vocab.undo'), onClick: () => restoreVocabNote(snapshot) },
  });
}

export function retryTranslationSoon(key: string) {
  retryVocabTranslation(key);
  scheduleVocabSync(SOON_MS);
}

/** The user's meaning; an empty one asks for a new translation (when there is none yet). */
export function saveMeaning(key: string, meaning: string) {
  const text = meaning.trim();
  setVocabMeaning(key, text);
  if (!text) scheduleVocabSync(SOON_MS);
}

export function syncVocabSoon() {
  scheduleVocabSync(SOON_MS);
}

let warnedStorageFull = false;

/** Warns once (until saving works again) when the browser has no room left for the notes. */
export function useStorageFullWarning() {
  const { t } = useTranslation();
  const saveFailed = useVocabStore((s) => s.saveFailed);
  useEffect(() => {
    if (!saveFailed) {
      warnedStorageFull = false;
      return;
    }
    if (warnedStorageFull) return;
    warnedStorageFull = true;
    toast.warning(t('vocab.storageFull'));
  }, [saveFailed, t]);
}
