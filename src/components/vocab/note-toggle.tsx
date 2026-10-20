import { PencilLine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { dismissNoteHint, toggleNoteMode, useNoteMode, useVocabUiStore } from './vocab-ui-store';

/** The pencil in the top bar: turns note mode on and off (also the N key). */
export function NoteToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const noteMode = useNoteMode();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleNoteMode}
      aria-pressed={noteMode}
      aria-label={t('vocab.noteMode')}
      title={`${noteMode ? t('vocab.noteModeOn') : t('vocab.noteMode')} (N)`}
      className={cn(
        noteMode &&
          'border-primary bg-primary-soft text-primary-soft-foreground hover:bg-primary/20 hover:text-primary-soft-foreground',
        className,
      )}
    >
      <PencilLine className="size-5" />
    </Button>
  );
}

/** One-line hint under the top bar while note mode is on; can be closed. */
export function NoteModeBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const noteMode = useNoteMode();
  const isDismissed = useVocabUiStore((s) => s.hintDismissed);
  if (!noteMode || isDismissed) return null;
  return (
    <div
      role="status"
      className={cn(
        'mt-3 flex animate-in items-center gap-2 rounded-2xl bg-primary-soft py-1.5 pr-1.5 pl-3 text-sm text-primary-soft-foreground duration-200 fade-in slide-in-from-top-1',
        className,
      )}
    >
      <PencilLine className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{t('vocab.hintSelect')}</p>
      <button
        type="button"
        onClick={dismissNoteHint}
        aria-label={t('vocab.close')}
        title={t('vocab.close')}
        className="flex size-7 shrink-0 items-center justify-center rounded-full transition hover:bg-primary/15"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
