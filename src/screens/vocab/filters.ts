import type { VocabEntry } from '@/vocab/merge';
import type { TermKind } from '@/vocab/term';

export type KindFilter = 'all' | TermKind;

export const KIND_FILTERS = [
  'all',
  'WORD',
  'PHRASE',
  'SENTENCE',
] as const satisfies readonly KindFilter[];

/** Lowercase, without accents ("Đường" → "duong"): search ignores case and Vietnamese marks. */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Notes whose term or meaning contains the query, ignoring case and accents. */
export function searchEntries<T extends Pick<VocabEntry, 'term' | 'meaning'>>(
  entries: readonly T[],
  query: string,
): T[] {
  const needle = foldForSearch(query).trim();
  if (!needle) return [...entries];
  return entries.filter(
    (entry) =>
      foldForSearch(entry.term).includes(needle) ||
      (entry.meaning !== null && foldForSearch(entry.meaning).includes(needle)),
  );
}

export function filterByKind<T extends Pick<VocabEntry, 'kind'>>(
  entries: readonly T[],
  kind: KindFilter,
): T[] {
  return kind === 'all' ? [...entries] : entries.filter((entry) => entry.kind === kind);
}

/** How many notes each filter pill would show. */
export function countByKind(
  entries: readonly Pick<VocabEntry, 'kind'>[],
): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    all: entries.length,
    WORD: 0,
    PHRASE: 0,
    SENTENCE: 0,
  };
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

/** Index letter of a term: A–Z without accents, "#" for anything else (digits, symbols). */
export function letterOf(term: string): string {
  const first = foldForSearch(term).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export type LetterGroup<T> = { letter: string; entries: T[] };

/** Groups sorted notes under their index letter, keeping the order of `sorted`. */
export function groupByLetter<T extends Pick<VocabEntry, 'term'>>(
  sorted: readonly T[],
): LetterGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of sorted) {
    const letter = letterOf(entry.term);
    const group = groups.get(letter);
    if (group) group.push(entry);
    else groups.set(letter, [entry]);
  }
  return Array.from(groups, ([letter, entries]) => ({ letter, entries }));
}
