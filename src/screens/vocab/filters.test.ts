import type { TermKind } from '@/vocab/term';

import {
  countByKind,
  filterByKind,
  foldForSearch,
  groupByLetter,
  letterOf,
  searchEntries,
} from './filters';

const note = (term: string, meaning: string | null, kind: TermKind = 'WORD') => ({
  term,
  meaning,
  kind,
});

const NOTES = [
  note('Baseline', 'Đường cơ sở'),
  note('critical path', 'đường găng', 'PHRASE'),
  note('Stakeholder', 'Bên liên quan'),
  note('The team agreed on the plan before the kickoff meeting.', null, 'SENTENCE'),
];

describe('foldForSearch', () => {
  it('drops case and Vietnamese accents', () => {
    expect(foldForSearch('Đường Găng')).toBe('duong gang');
    expect(foldForSearch('Bên liên quan')).toBe('ben lien quan');
    expect(foldForSearch('ƯỚC TÍNH')).toBe('uoc tinh');
  });

  it('collapses spaces', () => {
    expect(foldForSearch('critical \n  path')).toBe('critical path');
  });
});

describe('searchEntries', () => {
  it('matches the term or the meaning, with or without accents', () => {
    expect(searchEntries(NOTES, 'duong').map((n) => n.term)).toEqual(['Baseline', 'critical path']);
    expect(searchEntries(NOTES, 'ĐƯỜNG GĂNG').map((n) => n.term)).toEqual(['critical path']);
    expect(searchEntries(NOTES, 'STAKE').map((n) => n.term)).toEqual(['Stakeholder']);
  });

  it('returns everything for an empty query', () => {
    expect(searchEntries(NOTES, '   ')).toHaveLength(NOTES.length);
  });

  it('skips notes without a meaning when only the meaning could match', () => {
    expect(searchEntries(NOTES, 'lien quan').map((n) => n.term)).toEqual(['Stakeholder']);
    expect(searchEntries(NOTES, 'kickoff').map((n) => n.kind)).toEqual(['SENTENCE']);
  });
});

describe('kinds', () => {
  it('counts each kind and all', () => {
    expect(countByKind(NOTES)).toEqual({ all: 4, WORD: 2, PHRASE: 1, SENTENCE: 1 });
  });

  it('filters by kind', () => {
    expect(filterByKind(NOTES, 'all')).toHaveLength(4);
    expect(filterByKind(NOTES, 'PHRASE').map((n) => n.term)).toEqual(['critical path']);
  });
});

describe('letters', () => {
  it('indexes by the first letter without accents', () => {
    expect(letterOf('éclair')).toBe('E');
    expect(letterOf('đánh giá')).toBe('D');
    expect(letterOf('stakeholder')).toBe('S');
    expect(letterOf('3-point estimate')).toBe('#');
    expect(letterOf('"quoted"')).toBe('#');
  });

  it('groups in the given order and merges letters split by the sort', () => {
    const groups = groupByLetter([
      note('3-point', null),
      note('apple', null),
      note('Agile', null),
      note('đánh giá', null),
      note('budget', null),
      note('Delay', null),
    ]);
    expect(groups.map((g) => [g.letter, g.entries.map((e) => e.term)])).toEqual([
      ['#', ['3-point']],
      ['A', ['apple', 'Agile']],
      ['D', ['đánh giá', 'Delay']],
      ['B', ['budget']],
    ]);
  });
});
