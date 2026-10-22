import { itemId, type UserStateData } from './merge';

/** What the user did on a question-bank question, as synced (`PRACTICE` items keyed by its id). */
export interface PracticeValue<A = unknown> {
  /** The answer picked (`{ optionId }`, `{ optionIds }` or `{ pairs }`), null when none. */
  response: A | null;
  /** Checked: the solution and the explanation are shown, the answer is final. */
  checked: boolean;
}

/** The user's practice on a question, if any. */
export function practiceOf<A>(
  items: UserStateData['items'],
  questionId: string,
): PracticeValue<A> | undefined {
  const item = items[itemId('PRACTICE', questionId)];
  if (!item || item.deleted || typeof item.value !== 'object' || item.value === null) {
    return undefined;
  }
  return item.value as PracticeValue<A>;
}
