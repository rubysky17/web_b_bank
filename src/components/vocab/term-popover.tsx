import { Check, Pencil, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PopoverContent } from '@/components/ui/popover';
import { useVocabEntry } from '@/stores/vocab-store';

import { MeaningEditor, MeaningState } from './meaning';
import { deleteNoteWithUndo } from './vocab-actions';
import { closeTermPopover } from './vocab-ui-store';

/**
 * Meaning of a noted term, opened from its underline (or right after noting it, `justSaved`: then
 * "Undo" removes the note just made). Rendered inside `<VocabScope>`'s popover.
 */
export function TermPopoverContent({
  termKey,
  justSaved,
}: {
  termKey: string;
  justSaved: boolean;
}) {
  const { t } = useTranslation();
  const entry = useVocabEntry(termKey);
  const [isEditing, setIsEditing] = useState(false);
  const isShown = entry !== undefined && !entry.deleted;

  // Deleted elsewhere (another tab, a sync): nothing left to show.
  useEffect(() => {
    if (!isShown) closeTermPopover();
  }, [isShown]);

  if (!entry || entry.deleted) return null;

  const remove = () => {
    closeTermPopover();
    deleteNoteWithUndo(entry.key, t);
  };

  return (
    <PopoverContent
      side="bottom"
      sideOffset={8}
      collisionPadding={12}
      // Follows the underline while the page scrolls or reflows.
      updatePositionStrategy="always"
      aria-label={entry.term}
      className="flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-3"
      // Keeps the keyboard on the question (arrows, N); Escape still closes the popover.
      onOpenAutoFocus={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (!isEditing) return;
        event.preventDefault();
        setIsEditing(false);
      }}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-base font-semibold break-words">{entry.term}</p>
        {justSaved ? (
          <Badge variant="success" className="mt-0.5">
            <Check />
            {t('vocab.saved')}
          </Badge>
        ) : null}
      </div>
      <Badge variant="primary">{entry.partOfSpeech ?? t(`vocab.kind.${entry.kind}`)}</Badge>
      {isEditing ? (
        <MeaningEditor entry={entry} onDone={() => setIsEditing(false)} />
      ) : (
        <MeaningState entry={entry} />
      )}
      {entry.explanation ? (
        <p className="line-clamp-4 text-sm text-muted-foreground">{entry.explanation}</p>
      ) : null}
      {isEditing ? null : (
        <div className="-mx-1 flex items-center justify-end gap-1 border-t pt-2">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil />
            {entry.meaning ? t('vocab.editMeaning') : t('vocab.addMeaning')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            className="text-destructive-soft-foreground hover:bg-destructive-soft hover:text-destructive-soft-foreground"
          >
            {justSaved ? <Undo2 /> : <Trash2 />}
            {justSaved ? t('vocab.undo') : t('vocab.delete')}
          </Button>
        </div>
      )}
    </PopoverContent>
  );
}
