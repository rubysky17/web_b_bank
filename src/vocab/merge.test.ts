import {
  addNote,
  applySyncResult,
  buildPush,
  deleteNote,
  emptyVocab,
  mergeLocalCopies,
  nextUpdatedAt,
  restoreNote,
  retryTranslation,
  setMeaning,
  sortEntries,
  type VocabData,
  type VocabEntry,
  type VocabSyncResult,
} from './merge';

const T = 1_700_000_000_000;

function noted(terms: string[], at = T): VocabData {
  let data = emptyVocab();
  for (const term of terms) data = addNote(data, { term }, at)!.data;
  return data;
}

function item(entry: Partial<VocabEntry> & { key: string; updatedAt: number }) {
  return {
    term: entry.key,
    kind: 'WORD',
    meaning: null,
    partOfSpeech: null,
    explanation: null,
    context: null,
    sourceTitle: null,
    deleted: false,
    translateFailed: false,
    createdAt: T,
    ...entry,
  };
}

function result(partial: Partial<VocabSyncResult> = {}): VocabSyncResult {
  return {
    items: [],
    cursor: { rev: 1, key: 'x' },
    hasMore: false,
    pending: 0,
    maxRev: 1,
    translateUnavailable: false,
    rejected: [],
    ...partial,
  };
}

describe('addNote', () => {
  it('stores a normalised note and marks it for upload', () => {
    const added = addNote(
      emptyVocab(),
      { term: '  “Critical path,” ', context: 'Find the critical path.', sourceTitle: 'Test 1' },
      T,
    )!;
    expect(added.key).toBe('critical path');
    expect(added.data.entries['critical path']).toMatchObject({
      term: 'Critical path',
      kind: 'PHRASE',
      meaning: null,
      context: 'Find the critical path.',
      sourceTitle: 'Test 1',
      deleted: false,
      createdAt: T,
      updatedAt: T,
    });
    expect(added.data.dirty).toEqual({ 'critical path': true });
  });

  it('refuses text without a word', () => {
    expect(addNote(emptyVocab(), { term: '…' }, T)).toBeNull();
  });

  it('brings a deleted note back with its meaning', () => {
    let data = noted(['baseline']);
    data = setMeaning(data, 'baseline', 'đường cơ sở', T + 1);
    data = deleteNote(data, 'baseline', T + 2);
    const again = addNote(data, { term: 'Baseline' }, T + 3)!.data.entries.baseline!;
    expect(again).toMatchObject({ deleted: false, meaning: 'đường cơ sở', createdAt: T + 3 });
  });
});

describe('nextUpdatedAt', () => {
  it('always moves forward', () => {
    expect(nextUpdatedAt(undefined, T)).toBe(T);
    expect(nextUpdatedAt(T, T)).toBe(T + 1);
    expect(nextUpdatedAt(T + 10, T)).toBe(T + 11);
  });
});

describe('setMeaning and retryTranslation', () => {
  it('saves the user meaning, or asks for a translation when cleared', () => {
    let data = noted(['float']);
    data = { ...data, dirty: {} };
    data = setMeaning(data, 'float', '  thời gian dự trữ ', T + 1);
    expect(data.entries.float).toMatchObject({ meaning: 'thời gian dự trữ', updatedAt: T + 1 });

    const cleared = setMeaning(data, 'float', '   ', T + 2);
    expect(cleared).toBe(data); // a known meaning is never replaced by nothing
  });

  it('touches untranslated notes only', () => {
    const failed: VocabData = {
      ...noted(['float']),
      dirty: {},
    };
    failed.entries.float = { ...failed.entries.float!, translateFailed: true };
    const retried = retryTranslation(failed, 'float', T + 5);
    expect(retried.entries.float).toMatchObject({ translateFailed: false, updatedAt: T + 5 });
    expect(retried.dirty).toEqual({ float: true });
  });
});

describe('buildPush', () => {
  it('uploads dirty notes, oldest first, within the limit', () => {
    let data = noted(['b-word'], T + 5);
    data = addNote(data, { term: 'a-word' }, T)!.data;
    data = addNote(data, { term: 'c-word' }, T + 9)!.data;
    expect(buildPush(data).map((change) => change.key)).toEqual(['a-word', 'b-word', 'c-word']);
    expect(buildPush(data, 2)).toHaveLength(2);
  });

  it('keeps a request under the size limit', () => {
    let data = emptyVocab();
    for (let i = 0; i < 50; i += 1) {
      const term = `word${i}`;
      data = addNote(
        data,
        { term, context: 'x'.repeat(300), sourceTitle: 'y'.repeat(120) },
        T + i,
      )!.data;
      data = setMeaning(data, term, 'z'.repeat(300), T + i);
    }
    const changes = buildPush(data);
    expect(changes.length).toBeLessThan(50);
    expect(JSON.stringify(changes).length).toBeLessThan(31_000);
  });
});

describe('applySyncResult', () => {
  it('acknowledges what was uploaded and takes the translation', () => {
    const data = noted(['baseline']);
    const sent = buildPush(data);
    const { data: next, keysChanged } = applySyncResult(
      data,
      sent,
      result({
        items: [item({ key: 'baseline', updatedAt: T, meaning: 'đường cơ sở' })],
        cursor: { rev: 3, key: 'baseline' },
        maxRev: 3,
      }),
      T + 100,
    );
    expect(next.dirty).toEqual({});
    expect(next.entries.baseline?.meaning).toBe('đường cơ sở');
    expect(next.cursor).toEqual({ rev: 3, key: 'baseline' });
    expect(next.lastSyncedAt).toBe(T + 100);
    expect(keysChanged).toBe(false);
  });

  it('keeps a change made while the request was in flight', () => {
    const data = noted(['baseline']);
    const sent = buildPush(data);
    const edited = setMeaning(data, 'baseline', 'mốc chuẩn', T + 50);
    const { data: next } = applySyncResult(
      edited,
      sent,
      result({ items: [item({ key: 'baseline', updatedAt: T, meaning: 'đường cơ sở' })] }),
      T + 100,
    );
    expect(next.dirty).toEqual({ baseline: true });
    expect(next.entries.baseline?.meaning).toBe('mốc chuẩn');
  });

  it('fills the meaning of a newer local change still waiting', () => {
    const data = noted(['baseline']);
    const sent = buildPush(data);
    const touched = addNote(data, { term: 'baseline', context: 'New context.' }, T + 50)!.data;
    const { data: next } = applySyncResult(
      touched,
      sent,
      result({ items: [item({ key: 'baseline', updatedAt: T, meaning: 'đường cơ sở' })] }),
      T + 100,
    );
    expect(next.entries.baseline).toMatchObject({
      meaning: 'đường cơ sở',
      context: 'New context.',
    });
    expect(next.dirty).toEqual({ baseline: true });
  });

  it('lets a newer server version win over a local change', () => {
    const data = noted(['baseline']);
    const { data: next } = applySyncResult(
      data,
      [],
      result({ items: [item({ key: 'baseline', updatedAt: T + 10, meaning: 'mốc' })] }),
      T + 100,
    );
    expect(next.dirty).toEqual({});
    expect(next.entries.baseline?.meaning).toBe('mốc');
  });

  it('forgets acknowledged deletes and notes deleted elsewhere', () => {
    let data = noted(['baseline', 'float']);
    data = { ...data, dirty: {} };
    data = deleteNote(data, 'baseline', T + 1);
    const sent = buildPush(data);
    const { data: next, keysChanged } = applySyncResult(
      data,
      sent,
      result({ items: [item({ key: 'float', updatedAt: T + 5, deleted: true })] }),
      T + 100,
    );
    expect(next.entries).toEqual({});
    expect(next.dirty).toEqual({});
    expect(keysChanged).toBe(true);
  });

  it('drops invalid notes and moves rekeyed ones', () => {
    let data = noted(['baseline', 'float']);
    const sent = buildPush(data);
    data = {
      ...data,
      entries: {
        ...data.entries,
        Float: { ...data.entries.float!, key: 'Float' },
      },
    };
    delete data.entries.float;
    const sentWithOddKey = sent.map((change) =>
      change.key === 'float' ? { ...change, key: 'Float' } : change,
    );
    data.dirty = { baseline: true, Float: true };
    const { data: next } = applySyncResult(
      data,
      sentWithOddKey,
      result({
        rejected: [
          { key: 'baseline', code: 'INVALID_TERM' },
          { key: 'Float', code: 'REKEY', newKey: 'float' },
        ],
      }),
      T + 100,
    );
    expect(Object.keys(next.entries)).toEqual(['float']);
    expect(next.dirty).toEqual({});
  });

  it('starts over when the cursor is past the newest server row', () => {
    const { data: next } = applySyncResult(
      emptyVocab(),
      [],
      result({ cursor: { rev: 99, key: 'z' }, maxRev: 4 }),
      T,
    );
    expect(next.cursor).toBeNull();
  });
});

describe('restoreNote', () => {
  it('saves the snapshot again as a newer change', () => {
    let data = noted(['baseline']);
    const snapshot = data.entries.baseline!;
    data = deleteNote(data, 'baseline', T + 1);
    // The delete was synced and forgotten before the user pressed undo.
    data = applySyncResult(data, buildPush(data), result(), T + 2).data;
    expect(data.entries.baseline).toBeUndefined();

    const restored = restoreNote(data, snapshot, T + 1);
    expect(restored.entries.baseline).toMatchObject({ deleted: false, updatedAt: T + 1 });
    expect(restored.entries.baseline!.updatedAt).toBeGreaterThan(snapshot.updatedAt);
    expect(restored.dirty).toEqual({ baseline: true });
  });
});

describe('sortEntries', () => {
  it('sorts A–Z ignoring case and accents', () => {
    const data = noted(['beta', 'Alpha', 'élan', 'delta']);
    expect(sortEntries(Object.values(data.entries)).map((entry) => entry.term)).toEqual([
      'Alpha',
      'beta',
      'delta',
      'élan',
    ]);
  });
});

describe('mergeLocalCopies', () => {
  it('starts from the copy synced last and keeps every unsent change', () => {
    const synced: VocabData = { ...noted(['float']), dirty: {}, lastSyncedAt: T + 10 };
    const mine: VocabData = { ...noted(['baseline'], T + 20), lastSyncedAt: T };
    const merged = mergeLocalCopies(mine, synced);
    expect(Object.keys(merged.entries).sort()).toEqual(['baseline', 'float']);
    expect(merged.dirty).toEqual({ baseline: true });
    expect(merged.lastSyncedAt).toBe(T + 10);
  });
});
