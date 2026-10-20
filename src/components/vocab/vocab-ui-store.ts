import { create } from 'zustand';

/** Where the term popover points: a fixed rectangle, or a function that follows an element. */
export type VocabAnchor = DOMRect | (() => DOMRect);

export type TermPopoverState = {
  key: string;
  anchor: VocabAnchor;
  /** Opened right after noting the term: shows "Saved" and offers to undo it. */
  justSaved: boolean;
};

type VocabUiState = {
  /** Set while a screen that can show and note vocabulary is open (`<VocabScope>`). */
  scope: { sourceTitle: string | null } | null;
  /** Note mode: selecting text in the question saves it. */
  noteMode: boolean;
  /** The one-line hint shown in note mode was closed (until the screen closes). */
  hintDismissed: boolean;
  popover: TermPopoverState | null;
};

/** Screen-level vocabulary UI (not persisted). Vocabulary data lives in `stores/vocab-store.ts`. */
export const useVocabUiStore = create<VocabUiState>()(() => ({
  scope: null,
  noteMode: false,
  hintDismissed: false,
  popover: null,
}));

export function enterVocabScope(sourceTitle: string | null) {
  const { scope } = useVocabUiStore.getState();
  if (scope?.sourceTitle === sourceTitle) return;
  useVocabUiStore.setState({ scope: { sourceTitle } });
}

export function leaveVocabScope() {
  useVocabUiStore.setState({ scope: null, noteMode: false, hintDismissed: false, popover: null });
}

export function setNoteMode(noteMode: boolean) {
  const state = useVocabUiStore.getState();
  if (state.noteMode === noteMode || (noteMode && state.scope === null)) return;
  useVocabUiStore.setState({ noteMode, popover: null });
}

export function toggleNoteMode() {
  setNoteMode(!useVocabUiStore.getState().noteMode);
}

/** Leaves note mode; false when it was not on (the key press is someone else's). */
export function exitNoteMode(): boolean {
  if (!useVocabUiStore.getState().noteMode) return false;
  setNoteMode(false);
  return true;
}

export function dismissNoteHint() {
  useVocabUiStore.setState({ hintDismissed: true });
}

export function openTermPopover(key: string, anchor: VocabAnchor, justSaved = false) {
  useVocabUiStore.setState({ popover: { key, anchor, justSaved } });
}

/** Points the open popover of `key` somewhere else (e.g. at the underline drawn after saving). */
export function reanchorTermPopover(key: string, anchor: VocabAnchor) {
  const { popover } = useVocabUiStore.getState();
  if (popover?.key === key) useVocabUiStore.setState({ popover: { ...popover, anchor } });
}

export function closeTermPopover() {
  if (useVocabUiStore.getState().popover !== null) useVocabUiStore.setState({ popover: null });
}

/** Closes the popover only if it still points at `anchor`. */
function closeTermPopoverAt(anchor: VocabAnchor) {
  if (useVocabUiStore.getState().popover?.anchor === anchor) closeTermPopover();
}

/**
 * An anchor that follows `element` (scrolling, layout changes). Once the element leaves the page
 * (another question is shown), the popover pointing at it closes.
 */
export function elementAnchor(element: Element): () => DOMRect {
  let last = element.getBoundingClientRect();
  const anchor = () => {
    if (element.isConnected) last = element.getBoundingClientRect();
    else queueMicrotask(() => closeTermPopoverAt(anchor));
    return last;
  };
  return anchor;
}

export const useNoteMode = () => useVocabUiStore((s) => s.noteMode);
export const useIsInVocabScope = () => useVocabUiStore((s) => s.scope !== null);
