import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

type SyncStatusState = {
  /** Wall-clock time of the last upload the server acknowledged (shown in Settings only). */
  lastSyncedAt: number | null;
  markSynced: (at: number) => void;
};

export const useSyncStatusStore = create<SyncStatusState>()(
  persist(
    (set) => ({
      lastSyncedAt: null,
      markSynced: (at) => set({ lastSyncedAt: at }),
    }),
    {
      name: 'sync-status',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ lastSyncedAt }) => ({ lastSyncedAt }),
    },
  ),
);
