import { useEffect, useRef } from 'react';

type Handlers = Partial<Record<'prev' | 'next' | 'flag', () => void>>;

/** ← / → move between questions, F toggles the flag. Ignored while typing or with a dialog open. */
export function useQuestionHotkeys(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      if (event.key === 'ArrowLeft') ref.current.prev?.();
      else if (event.key === 'ArrowRight') ref.current.next?.();
      else if (event.key === 'f' || event.key === 'F') ref.current.flag?.();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
