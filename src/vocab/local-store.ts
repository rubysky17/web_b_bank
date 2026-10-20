import { emptyVocab, type VocabData } from './merge';

/** Synchronous key-value storage (MMKV on the phone, localStorage on the web). */
export interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  /** `false` when the value could not be saved (browser quota). */
  set: (key: string, value: string) => void | boolean;
  remove: (key: string) => void;
}

/** Storage keys of one user's vocabulary: the notes, and the sync bookkeeping. */
export const vocabKeys = (userId: string) => ({
  entries: `vocab:${userId}:entries`,
  meta: `vocab:${userId}:meta`,
});

function read<T>(storage: KeyValueStorage, key: string): T | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Each user's vocabulary under its own keys, so switching accounts on a device never mixes them
 * (and changes not uploaded yet wait for their owner to sign in again).
 */
export function createVocabLocalStore(storage: KeyValueStorage) {
  return {
    load(userId: string): VocabData {
      const keys = vocabKeys(userId);
      const entries = read<VocabData['entries']>(storage, keys.entries);
      const meta = read<Omit<VocabData, 'entries'>>(storage, keys.meta);
      return { ...emptyVocab(), ...meta, entries: entries ?? {} };
    },

    /** False when the browser refused the write (storage full). */
    save(userId: string, data: VocabData): boolean {
      const keys = vocabKeys(userId);
      const { entries, ...meta } = data;
      const savedEntries = storage.set(keys.entries, JSON.stringify(entries));
      const savedMeta = storage.set(keys.meta, JSON.stringify(meta));
      return savedEntries !== false && savedMeta !== false;
    },

    remove(userId: string) {
      const keys = vocabKeys(userId);
      storage.remove(keys.entries);
      storage.remove(keys.meta);
    },
  };
}
