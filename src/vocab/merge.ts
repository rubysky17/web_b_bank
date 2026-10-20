/**
 * The user's vocabulary on the device and how it merges with the server (`POST /vocab/sync`).
 * Pure functions over plain data; the store (`stores/vocab-store.ts`) persists and publishes it.
 *
 * - A note is identified by its `key` (`termKey(term)`); deleting leaves a tombstone until the
 *   server has it.
 * - Every local change gets a new `updatedAt` (device clock, strictly increasing per note) and is
 *   marked dirty until a sync acknowledges exactly that version.
 * - On conflicts the newest change wins; the server sends back the winner of every note uploaded.
 */
import {
  classifyKind,
  isValidTerm,
  MAX_CONTEXT_LENGTH,
  normalizeTerm,
  type TermKind,
  termKey,
} from './term';

export interface VocabEntry {
  key: string;
  term: string;
  kind: TermKind;
  /** Vietnamese meaning; null until translated (or typed). */
  meaning: string | null;
  partOfSpeech: string | null;
  explanation: string | null;
  /** Sentence the term was noted in. */
  context: string | null;
  /** Exam or practice where it was noted. */
  sourceTitle: string | null;
  deleted: boolean;
  /** The server gave up translating it: the user can type a meaning or retry. */
  translateFailed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VocabCursor {
  rev: number;
  key: string;
}

export interface VocabData {
  entries: Record<string, VocabEntry>;
  /** Notes changed on the device that the server has not acknowledged yet. */
  dirty: Record<string, true>;
  /** Where the next pull starts (null: from the beginning). */
  cursor: VocabCursor | null;
  /** Wall-clock time of the last successful sync (display only). */
  lastSyncedAt: number | null;
}

/** One note as uploaded. */
export interface VocabChange {
  key: string;
  term: string;
  meaning: string | null;
  partOfSpeech: string | null;
  explanation: string | null;
  context: string | null;
  sourceTitle: string | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What `POST /vocab/sync` answers (validated in `api/vocab.ts`). */
export interface VocabSyncResult {
  items: (Omit<VocabEntry, 'kind'> & { kind: string })[];
  cursor: VocabCursor | null;
  hasMore: boolean;
  pending: number;
  maxRev: number;
  translateUnavailable: boolean;
  rejected: { key: string; code: string; newKey?: string | null }[];
}

/** Server limits per upload (50 notes) with room to spare under the 100 kB body limit. */
export const PUSH_LIMIT = 50;
const PUSH_MAX_CHARS = 30_000;
const MAX_SOURCE_TITLE = 120;
/** Longest meaning kept (the server clips to the same length). */
export const MAX_MEANING = 300;

export const emptyVocab = (): VocabData => ({
  entries: {},
  dirty: {},
  cursor: null,
  lastSyncedAt: null,
});

/** A newer version stamp than `previous`, even when the clock did not move (or went back). */
export const nextUpdatedAt = (previous: number | undefined, now: number) =>
  Math.max(now, (previous ?? 0) + 1);

const clip = (value: string | null | undefined, max: number) => {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  return text === '' ? null : text.slice(0, max);
};

/** Notes that are shown (not deleted). */
export const activeEntries = (entries: Record<string, VocabEntry>) =>
  Object.values(entries).filter((entry) => !entry.deleted);

/** A–Z by term, ignoring case and accents. */
export const sortEntries = (entries: VocabEntry[]) =>
  [...entries].sort(
    (a, b) =>
      a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || a.key.localeCompare(b.key),
  );

function withEntry(data: VocabData, entry: VocabEntry): VocabData {
  return {
    ...data,
    entries: { ...data.entries, [entry.key]: entry },
    dirty: { ...data.dirty, [entry.key]: true },
  };
}

export interface NoteInput {
  term: string;
  context?: string | null;
  sourceTitle?: string | null;
}

/**
 * Notes a term (or touches it again): a deleted note comes back with its meaning, and a note the
 * server could not translate is sent again, which asks for a new try. Null when the term is not
 * valid (no word, too long).
 */
export function addNote(
  data: VocabData,
  input: NoteInput,
  now: number,
): { data: VocabData; key: string } | null {
  const term = normalizeTerm(input.term);
  if (!isValidTerm(term)) return null;
  const key = termKey(term);
  const previous = data.entries[key];
  const entry: VocabEntry = {
    key,
    term,
    kind: classifyKind(term),
    meaning: previous?.meaning ?? null,
    partOfSpeech: previous?.partOfSpeech ?? null,
    explanation: previous?.explanation ?? null,
    context: clip(input.context, MAX_CONTEXT_LENGTH) ?? previous?.context ?? null,
    sourceTitle: clip(input.sourceTitle, MAX_SOURCE_TITLE) ?? previous?.sourceTitle ?? null,
    deleted: false,
    translateFailed: false,
    createdAt: previous && !previous.deleted ? previous.createdAt : now,
    updatedAt: nextUpdatedAt(previous?.updatedAt, now),
  };
  return { data: withEntry(data, entry), key };
}

export function deleteNote(data: VocabData, key: string, now: number): VocabData {
  const previous = data.entries[key];
  if (!previous || previous.deleted) return data;
  return withEntry(data, {
    ...previous,
    deleted: true,
    updatedAt: nextUpdatedAt(previous.updatedAt, now),
  });
}

/** Undo of a delete: the snapshot taken before it, saved again as a new change. */
export function restoreNote(data: VocabData, snapshot: VocabEntry, now: number): VocabData {
  const current = data.entries[snapshot.key];
  const latest = Math.max(snapshot.updatedAt, current?.updatedAt ?? 0);
  return withEntry(data, {
    ...snapshot,
    // A translation that arrived after the delete is worth keeping.
    meaning: snapshot.meaning ?? current?.meaning ?? null,
    partOfSpeech: snapshot.meaning ? snapshot.partOfSpeech : (current?.partOfSpeech ?? null),
    explanation: snapshot.meaning ? snapshot.explanation : (current?.explanation ?? null),
    deleted: false,
    updatedAt: nextUpdatedAt(latest, now),
  });
}

/**
 * The user's own meaning. An empty one is not saved: clearing asks for a new translation instead
 * (the server never stores "no meaning" over a known one).
 */
export function setMeaning(data: VocabData, key: string, meaning: string, now: number) {
  const previous = data.entries[key];
  if (!previous) return data;
  const text = clip(meaning, MAX_MEANING);
  if (!text) return retryTranslation(data, key, now);
  return withEntry(data, {
    ...previous,
    meaning: text,
    translateFailed: false,
    updatedAt: nextUpdatedAt(previous.updatedAt, now),
  });
}

/** Asks the server to translate again (uploading the note without a meaning resets its tries). */
export function retryTranslation(data: VocabData, key: string, now: number): VocabData {
  const previous = data.entries[key];
  if (!previous || previous.meaning !== null) return data;
  return withEntry(data, {
    ...previous,
    translateFailed: false,
    updatedAt: nextUpdatedAt(previous.updatedAt, now),
  });
}

/** The next upload: dirty notes, oldest change first, within the server's limits. */
export function buildPush(data: VocabData, limit = PUSH_LIMIT): VocabChange[] {
  const dirty = Object.keys(data.dirty)
    .map((key) => data.entries[key])
    .filter((entry): entry is VocabEntry => entry !== undefined)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const changes: VocabChange[] = [];
  let size = 0;
  for (const entry of dirty) {
    const change: VocabChange = {
      key: entry.key,
      term: entry.term,
      meaning: entry.meaning,
      partOfSpeech: entry.partOfSpeech,
      explanation: entry.explanation,
      context: entry.context,
      sourceTitle: entry.sourceTitle,
      deleted: entry.deleted,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
    size += JSON.stringify(change).length;
    if (changes.length > 0 && (changes.length >= limit || size > PUSH_MAX_CHARS)) break;
    changes.push(change);
  }
  return changes;
}

const KINDS: readonly string[] = ['WORD', 'PHRASE', 'SENTENCE'];

function fromServer(item: VocabSyncResult['items'][number]): VocabEntry {
  return {
    ...item,
    kind: KINDS.includes(item.kind) ? (item.kind as TermKind) : classifyKind(item.term),
  };
}

/**
 * Applies a sync response to the data as it is now (the user may have changed notes while the
 * request was in flight). `sent` is what the request uploaded. `keysChanged` tells whether the set
 * of shown notes changed (the matcher must be rebuilt).
 */
export function applySyncResult(
  data: VocabData,
  sent: readonly VocabChange[],
  result: VocabSyncResult,
  now: number,
): { data: VocabData; keysChanged: boolean } {
  const entries = { ...data.entries };
  const dirty = { ...data.dirty };
  const isShown = (map: Record<string, VocabEntry>, key: string) => {
    const entry = map[key];
    return entry !== undefined && !entry.deleted;
  };
  const touched = new Set<string>();
  const sentAt = new Map(sent.map((change) => [change.key, change.updatedAt]));

  // 1. What the server acknowledged (unless the user changed it again meanwhile).
  for (const change of sent) {
    const local = entries[change.key];
    if (local?.updatedAt !== change.updatedAt) continue;
    delete dirty[change.key];
    if (local.deleted) {
      delete entries[change.key];
      touched.add(change.key);
    }
  }

  // 2. Notes the server dropped or stored under another key.
  for (const rejection of result.rejected) {
    const local = entries[rejection.key];
    if (!local) continue;
    const changedSince = local.updatedAt !== sentAt.get(rejection.key);
    if (rejection.code === 'INVALID_TERM' && !changedSince) {
      delete entries[rejection.key];
      delete dirty[rejection.key];
      touched.add(rejection.key);
    } else if (rejection.code === 'REKEY' && rejection.newKey) {
      delete entries[rejection.key];
      delete dirty[rejection.key];
      touched.add(rejection.key);
      const existing = entries[rejection.newKey];
      if (!existing || existing.updatedAt < local.updatedAt) {
        entries[rejection.newKey] = { ...local, key: rejection.newKey };
        if (changedSince) dirty[rejection.newKey] = true;
        touched.add(rejection.newKey);
      }
    }
  }

  // 3. The server's state, unless a newer local change is still waiting to be uploaded.
  for (const item of result.items) {
    const local = entries[item.key];
    touched.add(item.key);
    if (local && dirty[item.key] && local.updatedAt > item.updatedAt) {
      if (local.meaning === null && !item.deleted) {
        entries[item.key] = {
          ...local,
          meaning: item.meaning,
          partOfSpeech: item.partOfSpeech,
          explanation: item.explanation,
          translateFailed: item.meaning === null && item.translateFailed,
        };
      }
      continue;
    }
    delete dirty[item.key];
    if (item.deleted) delete entries[item.key];
    else entries[item.key] = fromServer(item);
  }

  // 4. A cursor past the newest row means the server's data was restored: start over.
  const cursor = result.cursor && result.cursor.rev > result.maxRev ? null : result.cursor;

  const keysChanged = [...touched].some(
    (key) => isShown(data.entries, key) !== isShown(entries, key),
  );
  return { data: { entries, dirty, cursor, lastSyncedAt: now }, keysChanged };
}

/**
 * Merges the copy another browser tab saved with this one. The copy synced last is the base (its
 * cursor matches its notes); changes not uploaded yet survive from both sides, newest first.
 */
export function mergeLocalCopies(mine: VocabData, theirs: VocabData): VocabData {
  const theirsNewer = (theirs.lastSyncedAt ?? 0) > (mine.lastSyncedAt ?? 0);
  const base = theirsNewer ? theirs : mine;
  const other = theirsNewer ? mine : theirs;
  const entries = { ...base.entries };
  const dirty = { ...base.dirty };
  for (const key of Object.keys(other.dirty)) {
    const entry = other.entries[key];
    const current = entries[key];
    if (entry && (!current || current.updatedAt < entry.updatedAt)) {
      entries[key] = entry;
      dirty[key] = true;
    }
  }
  return { entries, dirty, cursor: base.cursor, lastSyncedAt: base.lastSyncedAt };
}
