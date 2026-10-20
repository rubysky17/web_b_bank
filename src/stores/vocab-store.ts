import { create } from 'zustand';

import { createVocabLocalStore } from '@/vocab/local-store';
import { buildMatcher, type Matcher } from '@/vocab/matcher';
import {
  activeEntries,
  addNote,
  applySyncResult,
  deleteNote,
  emptyVocab,
  mergeLocalCopies,
  type NoteInput,
  restoreNote,
  retryTranslation,
  setMeaning,
  type VocabChange,
  type VocabData,
  type VocabEntry,
  type VocabSyncResult,
} from '@/vocab/merge';

import { storage } from './storage';

type VocabState = VocabData & {
  /** Whose vocabulary is loaded (null: signed out). */
  userId: string | null;
  /** Finds the shown notes in question text; rebuilt only when notes are added or removed. */
  matcher: Matcher;
  /** Bumped on every change made on the device: the sync schedules an upload. */
  localVersion: number;
  syncing: boolean;
  /**
   * Why notes may stay untranslated for now: the server could not be reached or refused the sync
   * (`server`), or it could not reach the translation service (`translator`). Cleared by the next good sync.
   */
  syncIssue: VocabSyncIssue | null;
  /** The last save to the device failed (browser storage full). */
  saveFailed: boolean;
};

export type VocabSyncIssue = 'server' | 'translator';

/**
 * The signed-in user's vocabulary notes, kept on the device (offline-first) and synced in the
 * background by `api/vocab-sync.ts`. Each user's notes live under their own storage keys.
 * Change it only through the functions below.
 */
export const useVocabStore = create<VocabState>()(() => ({
  userId: null,
  ...emptyVocab(),
  matcher: buildMatcher([]),
  localVersion: 0,
  syncing: false,
  syncIssue: null,
  saveFailed: false,
}));

export const vocabLocal = createVocabLocalStore(storage);

const SAVE_DELAY_MS = 250;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsaved = false;

const dataOf = ({ entries, dirty, cursor, lastSyncedAt }: VocabState): VocabData => ({
  entries,
  dirty,
  cursor,
  lastSyncedAt,
});

const matcherOf = (entries: Record<string, VocabEntry>) =>
  buildMatcher(activeEntries(entries).map((entry) => entry.key));

const isShown = (entry: VocabEntry | undefined) => entry !== undefined && !entry.deleted;

/** Writes pending changes to the device now (also when the app goes to the background). */
export function flushVocab() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const state = useVocabStore.getState();
  if (!unsaved || !state.userId) return;
  unsaved = false;
  const saved = vocabLocal.save(state.userId, dataOf(state));
  if (saved === state.saveFailed) useVocabStore.setState({ saveFailed: !saved });
}

function commit(next: VocabData, { keysChanged, local }: { keysChanged: boolean; local: boolean }) {
  useVocabStore.setState((state) => ({
    ...next,
    matcher: keysChanged ? matcherOf(next.entries) : state.matcher,
    localVersion: local ? state.localVersion + 1 : state.localVersion,
  }));
  unsaved = true;
  saveTimer ??= setTimeout(flushVocab, SAVE_DELAY_MS);
}

/** Loads the vocabulary of the signed-in user (null: signed out). No-op when it is already loaded. */
export function activateVocabUser(userId: string | null) {
  if (useVocabStore.getState().userId === userId) return;
  flushVocab();
  const data = userId ? vocabLocal.load(userId) : emptyVocab();
  useVocabStore.setState({
    userId,
    ...data,
    matcher: matcherOf(data.entries),
    syncing: false,
    syncIssue: null,
    saveFailed: false,
  });
}

/** Notes a term (or notes it again). Returns its key, or null when it has no word or is too long. */
export function noteTerm(input: NoteInput): string | null {
  const state = useVocabStore.getState();
  if (!state.userId) return null;
  const result = addNote(dataOf(state), input, Date.now());
  if (!result) return null;
  commit(result.data, { keysChanged: !isShown(state.entries[result.key]), local: true });
  return result.key;
}

/** Deletes a note; returns what it was, for undo (`restoreVocabNote`). */
export function deleteVocabNote(key: string): VocabEntry | null {
  const state = useVocabStore.getState();
  const entry = state.entries[key];
  if (!isShown(entry)) return null;
  commit(deleteNote(dataOf(state), key, Date.now()), { keysChanged: true, local: true });
  return entry ?? null;
}

export function restoreVocabNote(snapshot: VocabEntry) {
  const state = useVocabStore.getState();
  if (!state.userId) return;
  commit(restoreNote(dataOf(state), snapshot, Date.now()), {
    keysChanged: !isShown(state.entries[snapshot.key]),
    local: true,
  });
}

/** The user's own meaning; an empty one asks for a new translation instead. */
export function setVocabMeaning(key: string, meaning: string) {
  const state = useVocabStore.getState();
  commit(setMeaning(dataOf(state), key, meaning, Date.now()), { keysChanged: false, local: true });
}

export function retryVocabTranslation(key: string) {
  const state = useVocabStore.getState();
  commit(retryTranslation(dataOf(state), key, Date.now()), { keysChanged: false, local: true });
}

/**
 * Applies a sync response. If the user switched accounts while it ran, it goes to the copy of the
 * user it was made for.
 */
export function applyVocabSync(userId: string, sent: VocabChange[], result: VocabSyncResult) {
  const state = useVocabStore.getState();
  if (state.userId !== userId) {
    const merged = applySyncResult(vocabLocal.load(userId), sent, result, Date.now());
    vocabLocal.save(userId, merged.data);
    return;
  }
  const { data, keysChanged } = applySyncResult(dataOf(state), sent, result, Date.now());
  commit(data, { keysChanged, local: false });
}

export function setVocabSyncing(syncing: boolean) {
  if (useVocabStore.getState().syncing !== syncing) useVocabStore.setState({ syncing });
}

export function setVocabSyncIssue(syncIssue: VocabSyncIssue | null) {
  if (useVocabStore.getState().syncIssue !== syncIssue) useVocabStore.setState({ syncIssue });
}

/**
 * Another browser tab saved this user's vocabulary: merge it in (web). Saves back only when this
 * tab holds changes the other copy lacks, so two tabs never write back and forth.
 */
export function reloadVocabFromStorage() {
  const state = useVocabStore.getState();
  if (!state.userId) return;
  const theirs = vocabLocal.load(state.userId);
  const merged = mergeLocalCopies(dataOf(state), theirs);
  useVocabStore.setState({ ...merged, matcher: matcherOf(merged.entries) });
  const ahead = Object.keys(merged.dirty).some(
    (key) => theirs.entries[key]?.updatedAt !== merged.entries[key]?.updatedAt,
  );
  if (ahead) {
    unsaved = true;
    flushVocab();
  }
}

/** Forgets a user's vocabulary on this device (account deleted). */
export function clearVocabUser(userId: string) {
  vocabLocal.remove(userId);
  if (useVocabStore.getState().userId !== userId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  unsaved = false;
  useVocabStore.setState({ ...emptyVocab(), matcher: buildMatcher([]) });
}

export const useVocabEntries = () => useVocabStore((s) => s.entries);
export const useVocabEntry = (key: string | null | undefined) =>
  useVocabStore((s) => (key ? s.entries[key] : undefined));
export const useVocabMatcher = () => useVocabStore((s) => s.matcher);
export const useVocabSyncIssue = () => useVocabStore((s) => s.syncIssue);
/** Notes changed on the device and not uploaded yet. */
export const usePendingVocabCount = () => useVocabStore((s) => Object.keys(s.dirty).length);
