import type { StateStorage } from 'zustand/middleware';

type KeyValueStorage = {
  getString: (key: string) => string | undefined;
  /** False when the browser refused the write (quota exceeded). */
  set: (key: string, value: string) => boolean;
  remove: (key: string) => void;
};

const PREFIX = 'qbank:';

/**
 * App-wide synchronous key-value storage on `localStorage` (same shape as MMKV on mobile, so the
 * attempt engine runs unchanged). Falls back to memory when storage is blocked (private mode).
 */
function createStorage(): KeyValueStorage {
  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    return createMemoryStorage();
  }
  return {
    getString: (key) => window.localStorage.getItem(PREFIX + key) ?? undefined,
    set: (key, value) => {
      try {
        window.localStorage.setItem(PREFIX + key, value);
        return true;
      } catch (error) {
        // Quota exceeded: keep going, the server copy is the fallback.
        console.warn('[storage] write failed', key, error);
        return false;
      }
    },
    remove: (key) => window.localStorage.removeItem(PREFIX + key),
  };
}

function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
      return true;
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

export const storage: KeyValueStorage = createStorage();

/** Adapter so zustand `persist` reads/writes synchronously (no hydration flash). */
export const zustandStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => {
    storage.set(name, value);
  },
  removeItem: (name) => storage.remove(name),
};
