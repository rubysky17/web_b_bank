/**
 * Small records of the user kept on the device and shared by all their devices through
 * `POST /me/sync`: practice answers on the question bank and account settings. Pure functions over
 * plain data; the store (`stores/user-state-store.ts`) persists and publishes it.
 *
 * Same rules as the vocabulary (`vocab/merge.ts`):
 * - an item is `(kind, key)`; deleting leaves a tombstone until the server has it;
 * - every local change gets a new `updatedAt` (device clock, strictly increasing per item) and stays
 *   dirty until a sync acknowledges exactly that version;
 * - on conflicts the newest change wins; the server sends back the winner of every item uploaded.
 */

export type UserItemKind = 'PRACTICE' | 'SETTING';

export interface UserItem {
  kind: UserItemKind;
  key: string;
  /** JSON value; null once deleted. */
  value: unknown;
  deleted: boolean;
  updatedAt: number;
}

export interface UserStateCursor {
  rev: number;
  kind: string;
  key: string;
}

export interface UserStateData {
  /** By `itemId(kind, key)`. */
  items: Record<string, UserItem>;
  /** Items changed on the device that the server has not acknowledged yet: id → `updatedAt`. */
  dirty: Record<string, number>;
  /** Where the next pull starts (null: from the beginning). */
  cursor: UserStateCursor | null;
  /** Wall-clock time of the last successful sync (display only). */
  lastSyncedAt: number | null;
}

/** One item as uploaded. */
export type UserItemChange = UserItem;

/** What `POST /me/sync` answers (validated in `api/user-state.ts`). */
export interface UserStateSyncResult {
  items: { kind: string; key: string; value?: unknown; deleted: boolean; updatedAt: number }[];
  cursor: UserStateCursor | null;
  hasMore: boolean;
  maxRev: number;
  rejected: { kind: string; key: string; code: string }[];
}

/** Items per upload (the server takes 200) with room to spare under the 100 kB body limit. */
export const PUSH_LIMIT = 100;

export const itemId = (kind: string, key: string) => `${kind}:${key}`;

export const emptyUserState = (): UserStateData => ({
  items: {},
  dirty: {},
  cursor: null,
  lastSyncedAt: null,
});

const isKind = (kind: string): kind is UserItemKind => kind === 'PRACTICE' || kind === 'SETTING';

/** A local change must win over what the device already had, even with a clock set back. */
const nextVersion = (previous: UserItem | undefined, now: number) =>
  Math.max(Math.round(now), (previous?.updatedAt ?? 0) + 1);

/** Saves a value (a new answer, a new setting). */
export function setItem(
  data: UserStateData,
  kind: UserItemKind,
  key: string,
  value: unknown,
  now: number,
): UserStateData {
  const id = itemId(kind, key);
  const previous = data.items[id];
  const updatedAt = nextVersion(previous, now);
  return {
    ...data,
    items: { ...data.items, [id]: { kind, key, value, deleted: false, updatedAt } },
    dirty: { ...data.dirty, [id]: updatedAt },
  };
}

/** Deletes items (e.g. "practice again"); a tombstone stays until the server has it. */
export function deleteItems(
  data: UserStateData,
  kind: UserItemKind,
  keys: string[],
  now: number,
): UserStateData {
  const items = { ...data.items };
  const dirty = { ...data.dirty };
  for (const key of keys) {
    const id = itemId(kind, key);
    const previous = items[id];
    if (!previous || previous.deleted) continue;
    const updatedAt = nextVersion(previous, now);
    items[id] = { kind, key, value: null, deleted: true, updatedAt };
    dirty[id] = updatedAt;
  }
  return { ...data, items, dirty };
}

/** What to upload next: the dirty items, oldest change first, at most `PUSH_LIMIT`. */
export function buildPush(data: UserStateData): UserItemChange[] {
  return Object.keys(data.dirty)
    .flatMap((id) => {
      const item = data.items[id];
      return item ? [item] : [];
    })
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, PUSH_LIMIT);
}

/**
 * Applies a sync response: what was uploaded is acknowledged (unless it changed again meanwhile),
 * and what the server sent replaces the device copy unless the device holds a newer change.
 * Returns the ids of items whose value changed, for the screens and the settings to follow.
 */
export function applySyncResult(
  data: UserStateData,
  sent: UserItemChange[],
  result: UserStateSyncResult,
  now: number,
): { data: UserStateData; changed: string[] } {
  const items = { ...data.items };
  const dirty = { ...data.dirty };
  const changed: string[] = [];

  for (const change of sent) {
    const id = itemId(change.kind, change.key);
    if (dirty[id] === change.updatedAt) delete dirty[id];
  }
  // Refused by the server (does not fit its kind): stop uploading it.
  for (const { kind, key } of result.rejected) {
    const id = itemId(kind, key);
    const refused = sent.find((change) => itemId(change.kind, change.key) === id);
    if (refused && items[id]?.updatedAt === refused.updatedAt) {
      delete items[id];
      changed.push(id);
    }
  }
  for (const item of result.items) {
    if (!isKind(item.kind)) continue;
    const id = itemId(item.kind, item.key);
    const local = items[id];
    if (dirty[id] !== undefined && local && local.updatedAt > item.updatedAt) continue;
    // The server's copy won: whatever was waiting to be uploaded lost.
    delete dirty[id];
    const next: UserItem = {
      kind: item.kind,
      key: item.key,
      value: item.deleted ? null : (item.value ?? null),
      deleted: item.deleted,
      updatedAt: item.updatedAt,
    };
    if (!local || !sameItem(local, next)) changed.push(id);
    if (next.deleted) delete items[id];
    else items[id] = next;
  }

  // A cursor past the highest rev comes from a database restored from a backup: pull again.
  const cursor = result.cursor && result.cursor.rev > result.maxRev ? null : result.cursor;
  return { data: { items, dirty, cursor, lastSyncedAt: Math.round(now) }, changed };
}

/**
 * Two copies of the same user's state (web: another tab saved it). The newest change of each item
 * wins; it stays dirty if the copy it comes from had it dirty.
 */
export function mergeLocalCopies(mine: UserStateData, theirs: UserStateData): UserStateData {
  const items = { ...mine.items };
  const dirty = { ...mine.dirty };
  for (const [id, item] of Object.entries(theirs.items)) {
    const local = items[id];
    if (local && local.updatedAt >= item.updatedAt) continue;
    items[id] = item;
    if (theirs.dirty[id] === item.updatedAt) dirty[id] = item.updatedAt;
    else delete dirty[id];
  }
  return {
    items,
    dirty,
    // The lower cursor pulls again what the other one already has: harmless.
    cursor: (mine.cursor?.rev ?? 0) <= (theirs.cursor?.rev ?? 0) ? mine.cursor : theirs.cursor,
    lastSyncedAt: Math.max(mine.lastSyncedAt ?? 0, theirs.lastSyncedAt ?? 0) || null,
  };
}

const sameItem = (a: UserItem, b: UserItem) =>
  a.deleted === b.deleted && JSON.stringify(a.value) === JSON.stringify(b.value);
