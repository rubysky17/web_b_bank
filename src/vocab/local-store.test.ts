import { createVocabLocalStore, vocabKeys } from './local-store';
import { addNote, emptyVocab } from './merge';

function memoryStorage(full = false) {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      if (full) return false;
      values.set(key, value);
      return true;
    },
    remove: (key: string) => {
      values.delete(key);
    },
  };
}

describe('vocab local store', () => {
  it('saves and loads one user’s notes', () => {
    const storage = memoryStorage();
    const store = createVocabLocalStore(storage);
    const data = {
      ...addNote(emptyVocab(), { term: 'baseline' }, 1)!.data,
      cursor: { rev: 4, key: 'baseline' },
    };
    expect(store.save('u1', data)).toBe(true);
    expect(store.load('u1')).toEqual(data);
    expect(store.load('u2')).toEqual(emptyVocab());

    store.remove('u1');
    expect(storage.values.has(vocabKeys('u1').entries)).toBe(false);
    expect(store.load('u1')).toEqual(emptyVocab());
  });

  it('reports a full storage', () => {
    const store = createVocabLocalStore(memoryStorage(true));
    expect(store.save('u1', emptyVocab())).toBe(false);
  });

  it('survives a corrupt copy', () => {
    const storage = memoryStorage();
    storage.values.set(vocabKeys('u1').entries, '{oops');
    expect(createVocabLocalStore(storage).load('u1')).toEqual(emptyVocab());
  });
});
