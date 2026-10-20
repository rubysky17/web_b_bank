import { Fragment, memo, useMemo } from 'react';

import { useVocabMatcher } from '@/stores/vocab-store';
import { segment } from '@/vocab/matcher';

import { useIsInVocabScope } from './vocab-ui-store';

/**
 * Text with the user's noted terms underlined (dashed). Clicking one opens its meaning: the
 * enclosing `<VocabScope>` handles the click, so nothing interactive is nested in buttons.
 * Outside a scope it is the plain text.
 *
 * Put `data-vocab-block` on the element around it: note mode measures selections from there.
 */
export const VocabText = memo(function VocabText({ text }: { text: string }) {
  const isInScope = useIsInVocabScope();
  const matcher = useVocabMatcher();
  const segments = useMemo(
    () => (isInScope ? segment(text, matcher) : null),
    [isInScope, text, matcher],
  );
  if (!segments) return text;
  return segments.map((part) =>
    part.key === undefined ? (
      <Fragment key={part.start}>{part.text}</Fragment>
    ) : (
      <span
        key={part.start}
        data-vocab-key={part.key}
        data-vocab-start={part.start}
        className="cursor-pointer rounded-sm underline decoration-primary decoration-dashed decoration-1 underline-offset-4 transition-colors hover:bg-primary-soft"
      >
        {part.text}
      </span>
    ),
  );
});
