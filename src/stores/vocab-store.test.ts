import { vocabKeys } from '@/vocab/local-store';
import { segment } from '@/vocab/matcher';

import { storage } from './storage';
import {
  activateVocabUser,
  applyVocabSync,
  clearVocabUser,
  deleteVocabNote,
  flushVocab,
  noteTerm,
  restoreVocabNote,
  useVocabStore,
} from './vocab-store';

const ALICE = 'alice-id';
const BOB = 'bob-id';

const marked = (text: string) =>
  segment(text, useVocabStore.getState().matcher)
    .filter((part) => part.key)
    .map((part) => part.text);

describe('vocab store', () => {
  beforeEach(() => {
    clearVocabUser(ALICE);
    clearVocabUser(BOB);
    activateVocabUser(null);
    activateVocabUser(ALICE);
  });

  it('notes terms and finds them in text', () => {
    expect(noteTerm({ term: 'stakeholder', sourceTitle: 'Test 1' })).toBe('stakeholder');
    expect(marked('Ask the Stakeholder first.')).toEqual(['Stakeholder']);
    expect(useVocabStore.getState().localVersion).toBeGreaterThan(0);
  });

  it('needs a signed-in user', () => {
    activateVocabUser(null);
    expect(noteTerm({ term: 'stakeholder' })).toBeNull();
  });

  it('keeps each user’s notes apart and on the device', () => {
    noteTerm({ term: 'baseline' });
    flushVocab();
    expect(storage.getString(vocabKeys(ALICE).entries)).toContain('baseline');

    activateVocabUser(BOB);
    expect(useVocabStore.getState().entries).toEqual({});
    expect(marked('the baseline')).toEqual([]);

    activateVocabUser(ALICE);
    expect(Object.keys(useVocabStore.getState().entries)).toEqual(['baseline']);
    expect(useVocabStore.getState().dirty).toEqual({ baseline: true });
  });

  it('deletes and restores', () => {
    noteTerm({ term: 'baseline' });
    const snapshot = deleteVocabNote('baseline');
    expect(snapshot?.term).toBe('baseline');
    expect(marked('the baseline')).toEqual([]);
    expect(deleteVocabNote('baseline')).toBeNull();

    restoreVocabNote(snapshot!);
    expect(marked('the baseline')).toEqual(['baseline']);
  });

  it('applies a sync made for a user who has signed out since', () => {
    noteTerm({ term: 'baseline' });
    const sent = [
      {
        ...useVocabStore.getState().entries.baseline!,
      },
    ].map(({ kind: _kind, translateFailed: _failed, ...change }) => change);
    activateVocabUser(BOB);
    applyVocabSync(ALICE, sent, {
      items: [],
      cursor: { rev: 1, key: 'baseline' },
      hasMore: false,
      pending: 0,
      maxRev: 1,
      translateUnavailable: false,
      rejected: [],
    });
    expect(useVocabStore.getState().entries).toEqual({});

    activateVocabUser(ALICE);
    expect(useVocabStore.getState().dirty).toEqual({});
    expect(useVocabStore.getState().cursor).toEqual({ rev: 1, key: 'baseline' });
  });
});
