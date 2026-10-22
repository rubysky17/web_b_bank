import { createUserStateLocalStore, userStateKeys } from './local-store';
import { emptyUserState, setItem } from './merge';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
    },
    remove: (key: string) => {
      values.delete(key);
    },
  };
}

describe('user state local store', () => {
  it('keeps each user’s state under their own keys', () => {
    const storage = memoryStorage();
    const store = createUserStateLocalStore(storage);
    const data = setItem(emptyUserState(), 'SETTING', 'dailyGoal', 20, 1);
    expect(store.save('u1', data)).toBe(true);
    expect(store.load('u1')).toEqual(data);
    expect(store.load('u2')).toEqual(emptyUserState());

    store.remove('u1');
    expect(storage.values.has(userStateKeys('u1').items)).toBe(false);
    expect(store.load('u1')).toEqual(emptyUserState());
  });
});
