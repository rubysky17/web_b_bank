import { emptyUserState, type UserStateData } from './merge';

/** Synchronous key-value storage (MMKV on the phone, localStorage on the web). */
export interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  /** `false` when the value could not be saved (browser quota). */
  set: (key: string, value: string) => void | boolean;
  remove: (key: string) => void;
}

/** Storage keys of one user's state: the items, and the sync bookkeeping. */
export const userStateKeys = (userId: string) => ({
  items: `user-state:${userId}:items`,
  meta: `user-state:${userId}:meta`,
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
 * Each user's state under its own keys, so switching accounts on a device never mixes them (and
 * changes not uploaded yet wait for their owner to sign in again).
 */
export function createUserStateLocalStore(storage: KeyValueStorage) {
  return {
    load(userId: string): UserStateData {
      const keys = userStateKeys(userId);
      const items = read<UserStateData['items']>(storage, keys.items);
      const meta = read<Omit<UserStateData, 'items'>>(storage, keys.meta);
      return { ...emptyUserState(), ...meta, items: items ?? {} };
    },

    /** False when the browser refused the write (storage full). */
    save(userId: string, data: UserStateData): boolean {
      const keys = userStateKeys(userId);
      const { items, ...meta } = data;
      const savedItems = storage.set(keys.items, JSON.stringify(items));
      const savedMeta = storage.set(keys.meta, JSON.stringify(meta));
      return savedItems !== false && savedMeta !== false;
    },

    remove(userId: string) {
      const keys = userStateKeys(userId);
      storage.remove(keys.items);
      storage.remove(keys.meta);
    },
  };
}
