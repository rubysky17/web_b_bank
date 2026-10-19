import { useEffect, useRef } from 'react';

/**
 * Infinite scroll: returns a ref for a sentinel element; `onLoadMore` runs when it scrolls into
 * view (with some margin) and `enabled` is true.
 */
export function useLoadMore(onLoadMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onLoadMore);
  callback.current = onLoadMore;
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) callback.current();
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  return ref;
}
