import { create } from 'zustand';

import { createUserStateLocalStore } from '@/user-state/local-store';
import {
  applySyncResult,
  deleteItems,
  emptyUserState,
  itemId,
  mergeLocalCopies,
  setItem,
  type UserItem,
  type UserItemChange,
  type UserItemKind,
  type UserStateData,
  type UserStateSyncResult,
} from '@/user-state/merge';
import { practiceOf, type PracticeValue } from '@/user-state/practice';

import { storage } from './storage';

type UserStateState = UserStateData & {
  /** Whose state is loaded (null: signed out). */
  userId: string | null;
  /** Bumped on every change made on the device: the sync schedules an upload. */
  localVersion: number;
  syncing: boolean;
};

/**
 * The signed-in user's practice answers and account settings, kept on the device (offline-first)
 * and synced in the background by `api/user-state-sync.ts`. Each user's state lives under their own
 * storage keys. Change it only through the functions below.
 */
export const useUserStateStore = create<UserStateState>()(() => ({
  userId: null,
  ...emptyUserState(),
  localVersion: 0,
  syncing: false,
}));

export const userStateLocal = createUserStateLocalStore(storage);

const SAVE_DELAY_MS = 250;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsaved = false;

const dataOf = ({ items, dirty, cursor, lastSyncedAt }: UserStateState): UserStateData => ({
  items,
  dirty,
  cursor,
  lastSyncedAt,
});

/** Writes pending changes to the device now (also when the app goes to the background). */
export function flushUserState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const state = useUserStateStore.getState();
  if (!unsaved || !state.userId) return;
  unsaved = false;
  userStateLocal.save(state.userId, dataOf(state));
}

function commit(next: UserStateData, local: boolean) {
  useUserStateStore.setState((state) => ({
    ...next,
    localVersion: local ? state.localVersion + 1 : state.localVersion,
  }));
  unsaved = true;
  saveTimer ??= setTimeout(flushUserState, SAVE_DELAY_MS);
}

/** Loads the state of the signed-in user (null: signed out). No-op when it is already loaded. */
export function activateUserStateUser(userId: string | null) {
  if (useUserStateStore.getState().userId === userId) return;
  flushUserState();
  const data = userId ? userStateLocal.load(userId) : emptyUserState();
  useUserStateStore.setState({ userId, ...data, syncing: false });
}

/** Saves a value for the signed-in user; ignored while signed out. */
export function setUserItem(kind: UserItemKind, key: string, value: unknown) {
  const state = useUserStateStore.getState();
  if (!state.userId) return;
  commit(setItem(dataOf(state), kind, key, value, Date.now()), true);
}

/**
 * Uploads a value kept on the device from before it was synced, unless the user already has one:
 * it carries the oldest possible time, so whatever another device saved wins.
 */
export function seedUserItem(kind: UserItemKind, key: string, value: unknown) {
  const state = useUserStateStore.getState();
  if (!state.userId || state.items[itemId(kind, key)]) return;
  commit(setItem(dataOf(state), kind, key, value, 1), true);
}

export function deleteUserItems(kind: UserItemKind, keys: string[]) {
  const state = useUserStateStore.getState();
  if (!state.userId || keys.length === 0) return;
  commit(deleteItems(dataOf(state), kind, keys, Date.now()), true);
}

/**
 * Applies a sync response. If the user switched accounts while it ran, it goes to the copy of the
 * user it was made for.
 */
export function applyUserStateSync(
  userId: string,
  sent: UserItemChange[],
  result: UserStateSyncResult,
) {
  const state = useUserStateStore.getState();
  if (state.userId !== userId) {
    const merged = applySyncResult(userStateLocal.load(userId), sent, result, Date.now());
    userStateLocal.save(userId, merged.data);
    return;
  }
  commit(applySyncResult(dataOf(state), sent, result, Date.now()).data, false);
}

export function setUserStateSyncing(syncing: boolean) {
  if (useUserStateStore.getState().syncing !== syncing) useUserStateStore.setState({ syncing });
}

/**
 * Another browser tab saved this user's state: merge it in (web). Saves back only when this tab
 * holds changes the other copy lacks, so two tabs never write back and forth.
 */
export function reloadUserStateFromStorage() {
  const state = useUserStateStore.getState();
  if (!state.userId) return;
  const theirs = userStateLocal.load(state.userId);
  const merged = mergeLocalCopies(dataOf(state), theirs);
  useUserStateStore.setState(merged);
  const ahead = Object.keys(merged.dirty).some(
    (id) => theirs.items[id]?.updatedAt !== merged.items[id]?.updatedAt,
  );
  if (ahead) {
    unsaved = true;
    flushUserState();
  }
}

/** Forgets a user's state on this device (account deleted). */
export function clearUserStateUser(userId: string) {
  userStateLocal.remove(userId);
  if (useUserStateStore.getState().userId !== userId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  unsaved = false;
  useUserStateStore.setState(emptyUserState());
}

/** The live (not deleted) item, if any. */
export const liveItem = (state: UserStateData, kind: UserItemKind, key: string) => {
  const item: UserItem | undefined = state.items[itemId(kind, key)];
  return item && !item.deleted ? item : undefined;
};

/** Items changed on the device and not uploaded yet. */
export const usePendingUserStateCount = () => useUserStateStore((s) => Object.keys(s.dirty).length);

/** Saves the answer picked on a question-bank question (`checked`: show the solution now). */
export function savePracticeAnswer(questionId: string, response: unknown, checked: boolean) {
  setUserItem('PRACTICE', questionId, { response, checked } satisfies PracticeValue);
}

/** Shows the solution of a question answered in practice. */
export function checkPracticeAnswer(questionId: string) {
  const current = practiceOf(useUserStateStore.getState().items, questionId);
  setUserItem('PRACTICE', questionId, {
    response: current?.response ?? null,
    checked: true,
  } satisfies PracticeValue);
}

/** "Practice again": forgets the answers on these questions, on every device. */
export function resetPractice(questionIds: string[]) {
  const { items } = useUserStateStore.getState();
  deleteUserItems(
    'PRACTICE',
    questionIds.filter((id) => practiceOf(items, id) !== undefined),
  );
}
