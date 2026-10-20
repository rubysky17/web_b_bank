import { CircleAlert, Clock, CloudOff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { retryVocabSyncNow } from '@/api/vocab-sync';
import { useVocabSyncIssue } from '@/stores/vocab-store';
import { MAX_MEANING, type VocabEntry } from '@/vocab/merge';

import { retryTranslationSoon, saveMeaning, useIsOnline } from './vocab-actions';

/**
 * The meaning of a note, or why there is none yet: translating, waiting for the network, waiting
 * for the server or the translator (the last sync could not translate: retried automatically), or
 * the translation failed. Retry buttons unless `compact`, which sits inside a clickable row.
 */
export function MeaningState({
  entry,
  compact = false,
  className,
}: {
  entry: Pick<VocabEntry, 'key' | 'meaning' | 'translateFailed'>;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const isOnline = useIsOnline();
  const syncIssue = useVocabSyncIssue();

  // Spans only: the compact form sits inside a row's <button>.
  if (entry.meaning) {
    return (
      <span
        className={cn(
          compact
            ? 'line-clamp-2 text-sm text-foreground'
            : 'block text-lg leading-snug font-semibold text-primary-soft-foreground',
          className,
        )}
      >
        {entry.meaning}
      </span>
    );
  }
  const status = 'flex items-center gap-1.5 text-sm';
  if (entry.translateFailed) {
    return (
      <span className={cn(status, 'text-destructive-soft-foreground', className)}>
        <CircleAlert className="size-4 shrink-0" />
        {t('vocab.failed')}
        {compact ? null : (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-1"
            onClick={() => retryTranslationSoon(entry.key)}
          >
            {t('common.retry')}
          </Button>
        )}
      </span>
    );
  }
  if (!isOnline) {
    return (
      <span className={cn(status, 'text-muted-foreground', className)}>
        <CloudOff className="size-4 shrink-0" />
        {t('vocab.offline')}
      </span>
    );
  }
  // Never spin forever: when the last sync could not translate, say it will come later.
  if (syncIssue !== null) {
    return (
      <span className={cn(status, 'text-muted-foreground', className)}>
        <Clock className="size-4 shrink-0" />
        {t('vocab.waiting')}
        {compact ? null : (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-1"
            onClick={() => void retryVocabSyncNow()}
          >
            {t('common.retry')}
          </Button>
        )}
      </span>
    );
  }
  return (
    <span className={cn(status, 'text-muted-foreground', className)}>
      <Spinner className="size-4" />
      {t('vocab.translating')}
    </span>
  );
}

/**
 * The user's own meaning. Without a meaning yet, saving it empty asks for a new translation; an
 * existing meaning can be changed but not cleared (the server keeps the last known one).
 */
export function MeaningEditor({
  entry,
  onDone,
}: {
  entry: Pick<VocabEntry, 'key' | 'meaning'>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(entry.meaning ?? '');
  const canRetranslate = entry.meaning === null;
  const isEmpty = value.trim().length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isEmpty && !canRetranslate) return;
    saveMeaning(entry.key, value);
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('vocab.meaningPlaceholder')}
        aria-label={t('vocab.meaning')}
        maxLength={MAX_MEANING}
        autoFocus
        className="h-10 rounded-xl"
      />
      {canRetranslate ? (
        <p className="text-xs text-muted-foreground">{t('vocab.meaningHint')}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={isEmpty && !canRetranslate}>
          {t('vocab.save')}
        </Button>
      </div>
    </form>
  );
}
