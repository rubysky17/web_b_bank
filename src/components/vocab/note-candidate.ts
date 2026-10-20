import { expandToWords, MAX_TERM_LENGTH, normalizeTerm, sentenceAround } from '@/vocab/term';

export type NoteCandidate =
  | {
      status: 'ok';
      /** Offsets of the term in the block text, grown to whole words. */
      start: number;
      end: number;
      /** The term as written in the text. */
      term: string;
      /** The sentence around it. */
      context: string;
    }
  /** Longer than `MAX_TERM_LENGTH`: tell the user. */
  | { status: 'tooLong' }
  /** Nothing to note (no word selected). */
  | { status: 'none' };

/**
 * What noting the selection `[start, end)` of a block's text would save: the selection grown to
 * whole words, and its sentence.
 */
export function noteCandidate(text: string, start: number, end: number): NoteCandidate {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  if (from >= to) return { status: 'none' };
  const words = expandToWords(text, from, to);
  if (!words) return { status: 'none' };
  const term = text.slice(words.start, words.end);
  if (normalizeTerm(term).length > MAX_TERM_LENGTH) return { status: 'tooLong' };
  return {
    status: 'ok',
    start: words.start,
    end: words.end,
    term,
    context: sentenceAround(text, words.start, words.end),
  };
}

/**
 * Among the underlined terms of a block (`start` offsets), the one drawn for `key` closest to
 * `near` (the same term can appear several times in a paragraph).
 */
export function closestTerm<T extends { key: string; start: number }>(
  marks: readonly T[],
  key: string,
  near: number,
): T | null {
  let best: T | null = null;
  for (const mark of marks) {
    if (mark.key !== key) continue;
    if (!best || Math.abs(mark.start - near) < Math.abs(best.start - near)) best = mark;
  }
  return best;
}
