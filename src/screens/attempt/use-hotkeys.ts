import { useEffect, useRef } from 'react';

type Handlers = Partial<Record<'prev' | 'next' | 'flag' | 'note', () => void>> & {
  /** Escape: returns false when it had nothing to close (the key is left alone). */
  escape?: () => boolean;
};

const hasTextSelection = () => {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
};

/**
 * ← / → move between questions, F toggles the flag, N toggles vocabulary note mode, Escape leaves
 * it. Ignored while typing or with a dialog open; arrows also while text is selected (Shift+arrows
 * extend the selection).
 */
export function useQuestionHotkeys(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      if (isArrow && (event.shiftKey || hasTextSelection())) return;
      if (event.key === 'ArrowLeft') ref.current.prev?.();
      else if (event.key === 'ArrowRight') ref.current.next?.();
      else if (event.key === 'f' || event.key === 'F') ref.current.flag?.();
      else if ((event.key === 'n' || event.key === 'N') && ref.current.note) ref.current.note();
      else if (event.key === 'Escape') {
        // Already handled (e.g. a popover closed itself): one Escape, one effect.
        if (event.defaultPrevented || !ref.current.escape?.()) return;
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
