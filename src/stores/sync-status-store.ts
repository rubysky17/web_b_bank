import { create } from 'zustand';

import { storage } from './storage';

type SyncStatusState = {
  /** Whose status is shown (null: signed out). */
  userId: string | null;
  /** Wall-clock time of the last upload the server acknowledged (shown in Settings only). */
  lastSyncedAt: number | null;
  markSynced: (at: number) => void;
};

/** Each user's own "last synced", so another account on the device never shows it. */
const keyOf = (userId: string) => `u:${userId}:sync-status`;

export const useSyncStatusStore = create<SyncStatusState>()((set, get) => ({
  userId: null,
  lastSyncedAt: null,
  markSynced: (at) => {
    const { userId } = get();
    if (!userId) return;
    storage.set(keyOf(userId), String(at));
    set({ lastSyncedAt: at });
  },
}));

/** Shows the signed-in user's status (null: signed out). */
export function activateSyncStatusUser(userId: string | null) {
  if (useSyncStatusStore.getState().userId === userId) return;
  const saved = userId ? Number(storage.getString(keyOf(userId))) : NaN;
  useSyncStatusStore.setState({ userId, lastSyncedAt: Number.isFinite(saved) ? saved : null });
}
