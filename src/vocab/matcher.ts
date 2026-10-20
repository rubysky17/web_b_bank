import { tokenize } from './term';

interface TrieNode {
  next: Map<string, TrieNode>;
  /** Set when the words from the root to here are a noted term. */
  key?: string;
}

/** Finds noted terms in text: a trie of their words (keys are words joined by single spaces). */
export interface Matcher {
  root: TrieNode;
  size: number;
}

/** A run of text: plain, or a noted term (`key`). Offsets are in the source text. */
export interface Segment {
  text: string;
  start: number;
  end: number;
  key?: string;
}

export function buildMatcher(keys: Iterable<string>): Matcher {
  const root: TrieNode = { next: new Map() };
  let size = 0;
  for (const key of keys) {
    if (key === '') continue;
    let node = root;
    for (const word of key.split(' ')) {
      let child = node.next.get(word);
      if (!child) {
        child = { next: new Map() };
        node.next.set(word, child);
      }
      node = child;
    }
    if (node.key === undefined) size += 1;
    node.key = key;
  }
  return { root, size };
}

export const EMPTY_MATCHER: Matcher = buildMatcher([]);

/**
 * Splits `text` into plain runs and noted terms: whole words only, ignoring case and the
 * punctuation between words, longest term first ("critical path method" over "critical path").
 */
export function segment(text: string, matcher: Matcher): Segment[] {
  if (matcher.size === 0) return [{ text, start: 0, end: text.length }];
  const tokens = tokenize(text);
  const segments: Segment[] = [];
  let cursor = 0;
  let index = 0;
  while (index < tokens.length) {
    let node: TrieNode | undefined = matcher.root;
    let matchEnd = -1;
    let matchKey: string | undefined;
    for (let ahead = index; ahead < tokens.length; ahead += 1) {
      node = node.next.get(tokens[ahead]!.norm);
      if (!node) break;
      if (node.key !== undefined) {
        matchEnd = ahead;
        matchKey = node.key;
      }
    }
    if (matchKey === undefined) {
      index += 1;
      continue;
    }
    const start = tokens[index]!.start;
    const end = tokens[matchEnd]!.end;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), start: cursor, end: start });
    }
    segments.push({ text: text.slice(start, end), start, end, key: matchKey });
    cursor = end;
    index = matchEnd + 1;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor, end: text.length });
  }
  return segments;
}
