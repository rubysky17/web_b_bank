import { z } from 'zod';

/**
 * One shape per question type for the screens that show questions (test, review, practice).
 * The API sends what the test taker sees (`data`), the hidden key (`answerKey`, review only) and,
 * in the question bank, the full `definition`; these helpers turn each into the same model.
 */
const ItemSchema = z.object({ id: z.string(), content: z.string() });
type Item = z.infer<typeof ItemSchema>;

export type QuestionInput =
  | { type: 'SINGLE_CHOICE'; options: Item[] }
  | { type: 'MULTIPLE_CHOICE'; options: Item[]; selectCount: number }
  | { type: 'DRAG_DROP'; targets: Item[]; choices: Item[] };

export type AnswerKey =
  | { type: 'SINGLE_CHOICE'; correctOptionId: string }
  | { type: 'MULTIPLE_CHOICE'; correctOptionIds: string[] }
  | { type: 'DRAG_DROP'; pairs: Record<string, string> };

/** What the API stores as the answer: `{ optionId }`, `{ optionIds }` or `{ pairs }`. */
export type Answer =
  { optionId: string } | { optionIds: string[] } | { pairs: Record<string, string> };

const dataSchemas = {
  SINGLE_CHOICE: z.object({ options: z.array(ItemSchema) }),
  MULTIPLE_CHOICE: z.object({ options: z.array(ItemSchema), selectCount: z.number() }),
  DRAG_DROP: z.object({ targets: z.array(ItemSchema), choices: z.array(ItemSchema) }),
};

const keySchemas = {
  SINGLE_CHOICE: z.object({ correctOptionId: z.string() }),
  MULTIPLE_CHOICE: z.object({ correctOptionIds: z.array(z.string()) }),
  DRAG_DROP: z.object({ pairs: z.record(z.string(), z.string()) }),
};

const OptionsDefinitionSchema = z.object({
  options: z.array(ItemSchema.extend({ isCorrect: z.boolean() })),
});
const DragDropDefinitionSchema = z.object({
  targets: z.array(ItemSchema),
  choices: z.array(ItemSchema),
  answer: z.array(z.number()),
});

const isKnownType = (type: string): type is QuestionInput['type'] => type in dataSchemas;

/** The question as the test taker sees it; null for types the app cannot show. */
export function parseInput(type: string, data: unknown): QuestionInput | null {
  if (!isKnownType(type)) return null;
  const parsed = dataSchemas[type].safeParse(data);
  return parsed.success ? ({ type, ...parsed.data } as QuestionInput) : null;
}

export function parseKey(type: string, answerKey: unknown): AnswerKey | null {
  if (!isKnownType(type)) return null;
  const parsed = keySchemas[type].safeParse(answerKey);
  return parsed.success ? ({ type, ...parsed.data } as AnswerKey) : null;
}

/** A saved response, or null when there is none (or it does not fit the type). */
export function parseAnswer(type: string, response: unknown): Answer | null {
  const schema =
    type === 'SINGLE_CHOICE'
      ? z.object({ optionId: z.string() })
      : type === 'MULTIPLE_CHOICE'
        ? z.object({ optionIds: z.array(z.string()) })
        : type === 'DRAG_DROP'
          ? z.object({ pairs: z.record(z.string(), z.string()) })
          : null;
  const parsed = schema?.safeParse(response);
  return parsed?.success ? parsed.data : null;
}

/** Question bank: the full definition gives both what to show and the key. */
export function fromDefinition(
  type: string,
  definition: unknown,
): { input: QuestionInput; key: AnswerKey } | null {
  if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
    const parsed = OptionsDefinitionSchema.safeParse(definition);
    if (!parsed.success) return null;
    const options = parsed.data.options.map(({ id, content }) => ({ id, content }));
    const correct = parsed.data.options.filter((o) => o.isCorrect).map((o) => o.id);
    if (type === 'SINGLE_CHOICE') {
      const [correctOptionId] = correct;
      if (correctOptionId === undefined || correct.length !== 1) return null;
      return { input: { type, options }, key: { type, correctOptionId } };
    }
    return {
      input: { type, options, selectCount: correct.length },
      key: { type, correctOptionIds: correct },
    };
  }
  if (type === 'DRAG_DROP') {
    const parsed = DragDropDefinitionSchema.safeParse(definition);
    if (!parsed.success) return null;
    const { targets, choices, answer } = parsed.data;
    const pairs: Record<string, string> = {};
    targets.forEach((target, i) => {
      const choice = choices[answer[i] ?? -1];
      if (choice) pairs[target.id] = choice.id;
    });
    return { input: { type, targets, choices }, key: { type, pairs } };
  }
  return null;
}

/** Same rule as the server: all-or-nothing. */
export function isAnswerCorrect(key: AnswerKey, answer: Answer | null): boolean {
  if (!answer) return false;
  switch (key.type) {
    case 'SINGLE_CHOICE':
      return 'optionId' in answer && answer.optionId === key.correctOptionId;
    case 'MULTIPLE_CHOICE': {
      if (!('optionIds' in answer)) return false;
      const picked = new Set(answer.optionIds);
      return (
        picked.size === key.correctOptionIds.length &&
        key.correctOptionIds.every((id) => picked.has(id))
      );
    }
    case 'DRAG_DROP':
      return (
        'pairs' in answer &&
        Object.entries(key.pairs).every(([target, choice]) => answer.pairs[target] === choice)
      );
  }
}

/** True when the answer is complete enough to check (all picks made, every target filled). */
export function isAnswerComplete(input: QuestionInput, answer: Answer | null): boolean {
  if (!answer) return false;
  switch (input.type) {
    case 'SINGLE_CHOICE':
      return 'optionId' in answer;
    case 'MULTIPLE_CHOICE':
      return 'optionIds' in answer && answer.optionIds.length === input.selectCount;
    case 'DRAG_DROP':
      return 'pairs' in answer && input.targets.every((t) => answer.pairs[t.id] !== undefined);
  }
}

/**
 * Next answer after tapping an option (choice types). Multiple choice toggles and refuses to go
 * past `selectCount`; null means "no answer".
 */
export function toggleOption(
  input: Extract<QuestionInput, { type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' }>,
  answer: Answer | null,
  optionId: string,
): Answer | null {
  if (input.type === 'SINGLE_CHOICE') return { optionId };
  const current = answer && 'optionIds' in answer ? answer.optionIds : [];
  if (current.includes(optionId)) {
    const rest = current.filter((id) => id !== optionId);
    return rest.length > 0 ? { optionIds: rest } : null;
  }
  if (current.length >= input.selectCount) return answer;
  return { optionIds: [...current, optionId] };
}

/** Drag and drop: put `choiceId` in `targetId` (taking it out of any other target), or clear it. */
export function placeChoice(
  answer: Answer | null,
  targetId: string,
  choiceId: string | null,
): Answer | null {
  const pairs = { ...(answer && 'pairs' in answer ? answer.pairs : {}) };
  for (const [target, choice] of Object.entries(pairs)) {
    if (choice === choiceId) delete pairs[target];
  }
  if (choiceId === null) delete pairs[targetId];
  else pairs[targetId] = choiceId;
  return Object.keys(pairs).length > 0 ? { pairs } : null;
}
