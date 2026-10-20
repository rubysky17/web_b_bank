import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { Popover, PopoverAnchor } from '@/components/ui/popover';

import { TermPopoverContent } from './term-popover';
import { useNoteSelection } from './use-note-selection';
import { useStorageFullWarning } from './vocab-actions';
import {
  closeTermPopover,
  elementAnchor,
  enterVocabScope,
  leaveVocabScope,
  openTermPopover,
  useNoteMode,
  useVocabUiStore,
} from './vocab-ui-store';

const onOpenChange = (open: boolean) => {
  if (!open) closeTermPopover();
};

/**
 * A screen where vocabulary is shown and can be noted (attempts, practice, review): noted terms are
 * underlined in `<VocabText>` inside it, clicking one opens its meaning, and in note mode selected
 * text is saved. Notes are tagged with `sourceTitle` (the exam).
 *
 * One popover and one click listener serve the whole screen. The click listener runs in the capture
 * phase and swallows clicks on underlined terms, so clicking a word inside an answer option opens
 * its meaning without picking the option.
 */
export function VocabScope({
  sourceTitle,
  children,
}: {
  sourceTitle: string | null;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteMode = useNoteMode();
  const popover = useVocabUiStore((s) => s.popover);
  useStorageFullWarning();
  useNoteSelection(containerRef, noteMode);

  // Before paint, so the text renders underlined from the first frame.
  useLayoutEffect(() => {
    enterVocabScope(sourceTitle);
  }, [sourceTitle]);
  useLayoutEffect(() => leaveVocabScope, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const term = target?.closest<HTMLElement>('[data-vocab-key]');
      if (!term?.dataset.vocabKey || !container.contains(term)) return;
      event.preventDefault();
      event.stopPropagation();
      // The click ending a drag in note mode: the selection is about to be saved instead.
      const selection = window.getSelection();
      if (useVocabUiStore.getState().noteMode && selection && !selection.isCollapsed) return;
      openTermPopover(term.dataset.vocabKey, elementAnchor(term));
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, []);

  const anchor = popover?.anchor;
  // A new object per anchor: Radix re-positions when the anchor object changes.
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          anchor === undefined ? new DOMRect() : typeof anchor === 'function' ? anchor() : anchor,
      },
    }),
    [anchor],
  );

  return (
    <div ref={containerRef} className="contents" data-note-mode={noteMode ? '' : undefined}>
      {children}
      <Popover open={popover !== null} onOpenChange={onOpenChange}>
        <PopoverAnchor virtualRef={virtualRef} />
        {popover ? (
          <TermPopoverContent
            key={popover.key}
            termKey={popover.key}
            justSaved={popover.justSaved}
          />
        ) : null}
      </Popover>
    </div>
  );
}
