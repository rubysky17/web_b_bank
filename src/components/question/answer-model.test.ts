import {
  fromDefinition,
  isAnswerComplete,
  isAnswerCorrect,
  parseAnswer,
  parseInput,
  placeChoice,
  type QuestionInput,
  toggleOption,
} from './answer-model';

const options = ['A', 'B', 'C', 'D'].map((id) => ({ id, content: `Option ${id}` }));

describe('answer model', () => {
  it('parses the data of supported types only', () => {
    expect(parseInput('SINGLE_CHOICE', { options })?.type).toBe('SINGLE_CHOICE');
    expect(parseInput('MULTIPLE_CHOICE', { options, selectCount: 2 })).toMatchObject({
      selectCount: 2,
    });
    expect(parseInput('POINT_CHOICE', { options })).toBeNull();
    expect(parseInput('DRAG_DROP', { options })).toBeNull();
    expect(parseAnswer('MULTIPLE_CHOICE', { optionId: 'A' })).toBeNull();
  });

  it('builds input and key from a bank definition', () => {
    const multi = fromDefinition('MULTIPLE_CHOICE', {
      options: options.map((o) => ({ ...o, isCorrect: o.id === 'A' || o.id === 'C' })),
    });
    expect(multi?.input).toMatchObject({ selectCount: 2 });
    expect(multi?.key).toEqual({ type: 'MULTIPLE_CHOICE', correctOptionIds: ['A', 'C'] });

    const dd = fromDefinition('DRAG_DROP', {
      targets: [
        { id: 't1', content: 'First' },
        { id: 't2', content: 'Second' },
      ],
      choices: [
        { id: 'c1', content: 'Storming' },
        { id: 'c2', content: 'Forming' },
      ],
      answer: [1, 0],
    });
    expect(dd?.key).toEqual({ type: 'DRAG_DROP', pairs: { t1: 'c2', t2: 'c1' } });
  });

  it('toggles multiple choice up to selectCount', () => {
    const input = { type: 'MULTIPLE_CHOICE', options, selectCount: 2 } as const;
    let answer = toggleOption(input, null, 'A');
    answer = toggleOption(input, answer, 'B');
    expect(toggleOption(input, answer, 'C')).toEqual({ optionIds: ['A', 'B'] });
    expect(toggleOption(input, { optionIds: ['A'] }, 'A')).toBeNull();
    expect(isAnswerComplete(input, answer)).toBe(true);
    expect(isAnswerCorrect({ type: 'MULTIPLE_CHOICE', correctOptionIds: ['B', 'A'] }, answer)).toBe(
      true,
    );
  });

  it('moves a choice between targets and checks completeness', () => {
    const input: QuestionInput = {
      type: 'DRAG_DROP',
      targets: [
        { id: 't1', content: '1' },
        { id: 't2', content: '2' },
      ],
      choices: [
        { id: 'c1', content: 'x' },
        { id: 'c2', content: 'y' },
      ],
    };
    let answer = placeChoice(null, 't1', 'c1');
    answer = placeChoice(answer, 't2', 'c1');
    expect(answer).toEqual({ pairs: { t2: 'c1' } });
    expect(isAnswerComplete(input, answer)).toBe(false);
    answer = placeChoice(answer, 't1', 'c2');
    expect(isAnswerComplete(input, answer)).toBe(true);
    expect(placeChoice({ pairs: { t1: 'c1' } }, 't1', null)).toBeNull();
    expect(isAnswerCorrect({ type: 'DRAG_DROP', pairs: { t1: 'c2', t2: 'c1' } }, answer)).toBe(
      true,
    );
  });
});
