import { buildMatcher, segment } from './matcher';

const marked = (text: string, keys: string[]) =>
  segment(text, buildMatcher(keys)).map((part) => (part.key ? `[${part.text}]` : part.text));

describe('segment', () => {
  it('returns the text as is without notes', () => {
    expect(segment('Plain text.', buildMatcher([]))).toEqual([
      { text: 'Plain text.', start: 0, end: 11 },
    ]);
  });

  it('marks whole words, ignoring case', () => {
    expect(marked('The Stakeholder asked the stakeholders.', ['stakeholder'])).toEqual([
      'The ',
      '[Stakeholder]',
      ' asked the stakeholders.',
    ]);
  });

  it('prefers the longest term', () => {
    expect(
      marked('Use the critical path method on the critical path.', [
        'critical path',
        'critical path method',
      ]),
    ).toEqual(['Use the ', '[critical path method]', ' on the ', '[critical path]', '.']);
  });

  it('matches across punctuation and line breaks between words', () => {
    expect(marked('Cost,\nschedule and scope', ['cost schedule'])).toEqual([
      '[Cost,\nschedule]',
      ' and scope',
    ]);
  });

  it('keeps the offsets of every run', () => {
    const parts = segment('a baseline b', buildMatcher(['baseline']));
    expect(parts.map(({ start, end }) => [start, end])).toEqual([
      [0, 2],
      [2, 10],
      [10, 12],
    ]);
  });

  it('falls back to shorter terms when a longer one is incomplete', () => {
    expect(marked('the project manager', ['project', 'project manager office'])).toEqual([
      'the ',
      '[project]',
      ' manager',
    ]);
  });
});
