import { type RefObject, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { noteTerm, useVocabStore } from '@/stores/vocab-store';
import { termKey } from '@/vocab/term';

import { closestTerm, noteCandidate } from './note-candidate';
import { syncVocabSoon } from './vocab-actions';
import {
  elementAnchor,
  openTermPopover,
  reanchorTermPopover,
  useVocabUiStore,
} from './vocab-ui-store';

/** Touch selections are adjusted with handles (no pointer events): save once they rest this long. */
const TOUCH_SETTLE_MS = 1_000;

const BLOCK = '[data-vocab-block]';
/** Keys that extend a selection with Shift held. */
const SELECTION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

type Located = { block: HTMLElement; start: number; end: number; range: Range };

/**
 * Note mode: highlighting text inside the scope saves it right away (grown to whole words) and
 * opens its popover, which shows the translation as soon as it arrives.
 *
 * A selection is taken when the mouse is released, when Shift is released (keyboard selection), or
 * once a touch selection stops changing (its handles fire no pointer events).
 */
export function useNoteSelection(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!enabled) return;
    let isPointerDown = false;
    // Only touch selections are taken from `selectionchange` (not Ctrl+A, not a mouse drag).
    let isTouch = false;
    // Shift+arrows moved the selection: take it when Shift is released.
    let isShiftSelecting = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      timer = null;
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const located = locate(selection.getRangeAt(0), container);
      if (!located) return;
      const { block, start, end, range } = located;
      const text = block.textContent ?? '';
      const candidate = noteCandidate(text, start, end);
      if (candidate.status === 'none') return;
      if (candidate.status === 'tooLong') {
        toast.warning(tRef.current('vocab.tooLong'));
        return;
      }
      // Measured now: saving re-renders the block, which collapses the selection.
      const rect = DOMRect.fromRect(range.getBoundingClientRect());
      const wasNoted = isNoted(termKey(candidate.term));
      const key = noteTerm({
        term: candidate.term,
        context: candidate.context,
        sourceTitle: useVocabUiStore.getState().scope?.sourceTitle ?? null,
      });
      if (!key) return;
      syncVocabSoon();
      selection.removeAllRanges();
      // A term noted before just opens: "Saved · Undo" would delete an older note.
      openTermPopover(key, rect, !wasNoted);
      // Once the underline is drawn, follow it instead of the old selection's rectangle.
      requestAnimationFrame(() => {
        const span = findTermSpan(block.isConnected ? block : container, key, candidate.start);
        if (span) reanchorTermPopover(key, elementAnchor(span));
      });
    };

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(commit, delay);
    };

    const onPointerDown = (event: PointerEvent) => {
      isPointerDown = true;
      isTouch = event.pointerType !== 'mouse';
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onPointerUp = () => {
      isPointerDown = false;
      // Mouse: after the click that ends the drag (the scope ignores clicks while text is
      // selected). Touch: once the handles rest.
      schedule(isTouch ? TOUCH_SETTLE_MS : 0);
    };
    const onPointerCancel = () => {
      isPointerDown = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && SELECTION_KEYS.has(event.key)) isShiftSelecting = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || !isShiftSelecting) return;
      isShiftSelecting = false;
      schedule(0);
    };
    const onSelectionChange = () => {
      if (isTouch && !isPointerDown) schedule(TOUCH_SETTLE_MS);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [containerRef, enabled]);
}

function isNoted(key: string) {
  const entry = useVocabStore.getState().entries[key];
  return entry !== undefined && !entry.deleted;
}

function blockOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(BLOCK) ?? null;
}

/** Characters of `block`'s text before the point (`node`, `offset`). */
function offsetIn(block: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(block);
  // Never `selection.toString()`: its whitespace differs from the text content.
  before.setEnd(node, offset);
  return before.toString().length;
}

/**
 * The block a selection is in, with its offsets in the block's text. A selection running over
 * several blocks is cut at the end of the first one (or starts at the last one when it began
 * outside any block, e.g. on an option letter).
 */
function locate(range: Range, container: HTMLElement): Located | null {
  const startBlock = blockOf(range.startContainer);
  if (startBlock && container.contains(startBlock)) {
    const length = startBlock.textContent?.length ?? 0;
    if (blockOf(range.endContainer) === startBlock) {
      return {
        block: startBlock,
        start: offsetIn(startBlock, range.startContainer, range.startOffset),
        end: offsetIn(startBlock, range.endContainer, range.endOffset),
        range,
      };
    }
    const clipped = range.cloneRange();
    clipped.setEnd(startBlock, startBlock.childNodes.length);
    return {
      block: startBlock,
      start: offsetIn(startBlock, range.startContainer, range.startOffset),
      end: length,
      range: clipped,
    };
  }
  const endBlock = blockOf(range.endContainer);
  if (endBlock && container.contains(endBlock)) {
    const clipped = range.cloneRange();
    clipped.setStart(endBlock, 0);
    return {
      block: endBlock,
      start: 0,
      end: offsetIn(endBlock, range.endContainer, range.endOffset),
      range: clipped,
    };
  }
  return null;
}

/** The underline drawn for `key` nearest to where the term was selected. */
function findTermSpan(root: HTMLElement, key: string, near: number): HTMLElement | null {
  const marks = Array.from(root.querySelectorAll<HTMLElement>('[data-vocab-key]')).map((span) => ({
    span,
    key: span.dataset.vocabKey ?? '',
    start: Number(span.dataset.vocabStart ?? 0),
  }));
  return closestTerm(marks, key, near)?.span ?? null;
}
