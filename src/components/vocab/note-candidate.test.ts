import { MAX_TERM_LENGTH } from '@/vocab/term';

import { closestTerm, noteCandidate } from './note-candidate';

const TEXT = 'The project manager meets the stakeholders. Then the team plans the work.';

describe('noteCandidate', () => {
  it('grows a partial selection to whole words', () => {
    // "akehold" inside "stakeholders"
    const start = TEXT.indexOf('akehold');
    expect(noteCandidate(TEXT, start, start + 7)).toEqual({
      status: 'ok',
      start: TEXT.indexOf('stakeholders'),
      end: TEXT.indexOf('stakeholders') + 'stakeholders'.length,
      term: 'stakeholders',
      context: 'The project manager meets the stakeholders.',
    });
  });

  it('keeps a phrase as written and takes its sentence', () => {
    const start = TEXT.indexOf('roject ma');
    const result = noteCandidate(TEXT, start, start + 'roject ma'.length);
    expect(result).toMatchObject({ status: 'ok', term: 'project manager' });
  });

  it('accepts a reversed selection', () => {
    const start = TEXT.indexOf('team');
    expect(noteCandidate(TEXT, start + 4, start)).toMatchObject({ status: 'ok', term: 'team' });
  });

  it('drops the punctuation and spaces around the words', () => {
    const start = TEXT.indexOf('stakeholders') - 1;
    const result = noteCandidate(TEXT, start, start + 'stakeholders. '.length + 1);
    expect(result).toMatchObject({ status: 'ok', term: 'stakeholders' });
  });

  it('finds nothing in an empty or wordless selection', () => {
    expect(noteCandidate(TEXT, 5, 5)).toEqual({ status: 'none' });
    expect(noteCandidate('a — b', 1, 4)).toEqual({ status: 'none' });
    expect(noteCandidate(TEXT, -10, 0)).toEqual({ status: 'none' });
  });

  it('clamps offsets to the text', () => {
    expect(noteCandidate('budget', -3, 99)).toMatchObject({ status: 'ok', term: 'budget' });
  });

  it('refuses terms longer than the limit', () => {
    const long = Array.from({ length: 40 }, () => 'schedule').join(' ');
    expect(long.length).toBeGreaterThan(MAX_TERM_LENGTH);
    expect(noteCandidate(long, 0, long.length)).toEqual({ status: 'tooLong' });
  });

  it('measures the limit after collapsing line breaks and spaces', () => {
    const words = Array.from({ length: 30 }, () => 'cost').join('  \n  ');
    expect(words.length).toBeGreaterThan(MAX_TERM_LENGTH);
    expect(noteCandidate(words, 0, words.length)).toMatchObject({ status: 'ok' });
  });
});

describe('closestTerm', () => {
  const marks = [
    { key: 'risk', start: 4 },
    { key: 'scope', start: 20 },
    { key: 'risk', start: 40 },
  ];

  it('picks the occurrence of the key nearest to the selection', () => {
    expect(closestTerm(marks, 'risk', 38)).toBe(marks[2]);
    expect(closestTerm(marks, 'risk', 0)).toBe(marks[0]);
  });

  it('is null when the key is not drawn', () => {
    expect(closestTerm(marks, 'budget', 0)).toBeNull();
  });
});
