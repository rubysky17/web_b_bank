import { fromParams, toParams } from './filters';

describe('bank filters as route params', () => {
  it('round-trips and drops empty filters', () => {
    const params = toParams({ examId: 'e1', difficulty: 'EXPERT', domainId: undefined }, 4);
    expect(params).toEqual({ start: '4', examId: 'e1', difficulty: 'EXPERT' });
    expect(fromParams(params)).toEqual({
      filters: { examId: 'e1', sectionId: undefined, domainId: undefined, difficulty: 'EXPERT' },
      start: 4,
    });
  });

  it('ignores garbage', () => {
    expect(fromParams({ difficulty: 'WHAT', start: '-3' })).toEqual({
      filters: {
        examId: undefined,
        sectionId: undefined,
        domainId: undefined,
        difficulty: undefined,
      },
      start: 0,
    });
  });
});
