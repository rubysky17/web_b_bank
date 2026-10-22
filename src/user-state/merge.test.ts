import {
  applySyncResult,
  buildPush,
  deleteItems,
  emptyUserState,
  itemId,
  mergeLocalCopies,
  setItem,
  type UserStateSyncResult,
} from './merge';
import { practiceOf } from './practice';

const result = (extra: Partial<UserStateSyncResult> = {}): UserStateSyncResult => ({
  items: [],
  cursor: { rev: 1, kind: 'PRACTICE', key: 'q1' },
  hasMore: false,
  maxRev: 1,
  rejected: [],
  ...extra,
});

describe('user state merge', () => {
  it('marks local changes dirty until the server acknowledges that version', () => {
    const data = setItem(
      emptyUserState(),
      'PRACTICE',
      'q1',
      { response: null, checked: false },
      10,
    );
    const sent = buildPush(data);
    expect(sent).toHaveLength(1);

    const changedMeanwhile = setItem(data, 'PRACTICE', 'q1', { response: null, checked: true }, 20);
    const acked = applySyncResult(changedMeanwhile, sent, result(), 30).data;
    // The newer change still waits for the next upload.
    expect(acked.dirty).toEqual({ [itemId('PRACTICE', 'q1')]: 20 });

    const done = applySyncResult(data, sent, result(), 30).data;
    expect(done.dirty).toEqual({});
    expect(done.cursor).toEqual({ rev: 1, kind: 'PRACTICE', key: 'q1' });
  });

  it('takes what another device saved, unless the device holds a newer change', () => {
    const remote = {
      kind: 'PRACTICE',
      key: 'q1',
      value: { response: { optionId: 'b' }, checked: true },
      deleted: false,
      updatedAt: 50,
    };
    const pulled = applySyncResult(emptyUserState(), [], result({ items: [remote] }), 60);
    expect(practiceOf(pulled.data.items, 'q1')).toEqual({
      response: { optionId: 'b' },
      checked: true,
    });
    expect(pulled.changed).toEqual([itemId('PRACTICE', 'q1')]);

    const newer = setItem(
      emptyUserState(),
      'PRACTICE',
      'q1',
      { response: { optionId: 'a' }, checked: false },
      70,
    );
    const kept = applySyncResult(newer, [], result({ items: [remote] }), 80).data;
    expect(practiceOf(kept.items, 'q1')?.response).toEqual({ optionId: 'a' });
    expect(kept.dirty[itemId('PRACTICE', 'q1')]).toBe(70);
  });

  it('keeps a tombstone until the server has it, then forgets the item', () => {
    const saved = applySyncResult(
      setItem(emptyUserState(), 'PRACTICE', 'q1', { response: null, checked: true }, 10),
      [],
      result(),
      11,
    ).data;
    const deleted = deleteItems(saved, 'PRACTICE', ['q1', 'unknown'], 20);
    expect(practiceOf(deleted.items, 'q1')).toBeUndefined();
    const sent = buildPush(deleted);
    expect(sent).toEqual([expect.objectContaining({ key: 'q1', deleted: true })]);

    const echoed = { ...sent[0]!, value: null };
    const done = applySyncResult(deleted, sent, result({ items: [echoed] }), 30).data;
    expect(done.items).toEqual({});
    expect(done.dirty).toEqual({});
  });

  it('always moves a local version forward, even with a clock set back', () => {
    const first = setItem(emptyUserState(), 'SETTING', 'language', 'vi', 100);
    const second = setItem(first, 'SETTING', 'language', 'en', 50);
    expect(second.items[itemId('SETTING', 'language')]?.updatedAt).toBe(101);
  });

  it('drops items the server refused and restarts after a database restore', () => {
    const data = setItem(emptyUserState(), 'SETTING', 'language', 'xx', 10);
    const sent = buildPush(data);
    const { data: next } = applySyncResult(
      data,
      sent,
      result({
        rejected: [{ kind: 'SETTING', key: 'language', code: 'INVALID_ITEM' }],
        cursor: { rev: 9, kind: 'SETTING', key: 'x' },
        maxRev: 3,
      }),
      20,
    );
    expect(next.items).toEqual({});
    expect(next.cursor).toBeNull();
  });

  it('merges two local copies item by item', () => {
    const mine = setItem(emptyUserState(), 'SETTING', 'language', 'vi', 10);
    const theirs = setItem(
      setItem(emptyUserState(), 'SETTING', 'language', 'en', 20),
      'SETTING',
      'dailyGoal',
      30,
      5,
    );
    const merged = mergeLocalCopies(mine, theirs);
    expect(merged.items[itemId('SETTING', 'language')]?.value).toBe('en');
    expect(merged.items[itemId('SETTING', 'dailyGoal')]?.value).toBe(30);
    expect(merged.dirty).toEqual({
      [itemId('SETTING', 'language')]: 20,
      [itemId('SETTING', 'dailyGoal')]: 5,
    });
  });
});
