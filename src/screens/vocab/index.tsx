import { BookA, CloudCheck, CloudUpload, Pencil, Search, Trash2 } from 'lucide-react';
import {
  Fragment,
  memo,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { syncVocab } from '@/api/vocab-sync';
import { FilterPill, PillRow } from '@/components/app/filter-pill';
import { EmptyView } from '@/components/app/states';
import { Page, PageTitle } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { MeaningEditor, MeaningState } from '@/components/vocab/meaning';
import { deleteNoteWithUndo, useStorageFullWarning } from '@/components/vocab/vocab-actions';
import { cn } from '@/lib/utils';
import {
  usePendingVocabCount,
  useVocabEntries,
  useVocabEntry,
  useVocabStore,
} from '@/stores/vocab-store';
import { buildMatcher, segment } from '@/vocab/matcher';
import { activeEntries, sortEntries, type VocabEntry } from '@/vocab/merge';

import {
  countByKind,
  filterByKind,
  groupByLetter,
  KIND_FILTERS,
  type KindFilter,
  searchEntries,
} from './filters';

/** The user's noted words, phrases and sentences, A–Z, with search and a filter by kind. */
export function VocabScreen() {
  const { t } = useTranslation();
  const entries = useVocabEntries();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<KindFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  useStorageFullWarning();

  // Fresh translations and notes from other devices.
  useEffect(() => {
    void syncVocab();
  }, []);

  const sorted = useMemo(() => sortEntries(activeEntries(entries)), [entries]);
  const matching = useMemo(() => searchEntries(sorted, deferredQuery), [sorted, deferredQuery]);
  const counts = useMemo(() => countByKind(matching), [matching]);
  const groups = useMemo(() => groupByLetter(filterByKind(matching, kind)), [matching, kind]);

  const onOpen = useCallback((key: string) => setOpenKey(key), []);
  const onClose = useCallback(() => setOpenKey(null), []);
  const onDelete = useCallback((key: string) => deleteNoteWithUndo(key, t), [t]);

  return (
    <Page className="gap-4">
      <PageTitle title={t('vocab.title')} subtitle={t('vocab.subtitle')} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">{t('vocab.count', { count: sorted.length })}</Badge>
        <SyncStatus />
      </div>

      {sorted.length === 0 ? (
        <EmptyView icon={BookA} message={t('vocab.empty')} hint={t('vocab.emptyHint')} />
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('vocab.search')}
              aria-label={t('vocab.search')}
              className="pl-11"
            />
          </div>
          <PillRow>
            {KIND_FILTERS.map((value) => (
              <FilterPill
                key={value}
                label={`${t(`vocab.filter.${value}`)} · ${counts[value]}`}
                isSelected={kind === value}
                onPress={() => setKind(value)}
              />
            ))}
          </PillRow>
          {groups.length === 0 ? (
            <EmptyView icon={Search} message={t('vocab.noMatch')} />
          ) : (
            <div className="flex flex-col">
              {groups.map((group) => (
                <section key={group.letter} aria-label={group.letter}>
                  <h2 className="sticky top-0 z-10 -mx-4 bg-background/95 px-5 py-1.5 text-sm font-semibold text-muted-foreground backdrop-blur md:mx-0 md:px-1">
                    {group.letter}
                  </h2>
                  <ul className="flex flex-col gap-2 pb-3">
                    {group.entries.map((entry) => (
                      <VocabRow key={entry.key} entry={entry} onOpen={onOpen} onDelete={onDelete} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <VocabSheet entryKey={openKey} onClose={onClose} />
    </Page>
  );
}

/** "Syncing…", "3 items waiting to sync" or "Synced". */
function SyncStatus() {
  const { t } = useTranslation();
  const syncing = useVocabStore((s) => s.syncing);
  const pending = usePendingVocabCount();
  const chip = 'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (syncing) {
    return (
      <span className={cn(chip, 'bg-secondary text-muted-foreground')}>
        <Spinner className="size-3" />
        {t('vocab.syncing')}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className={cn(chip, 'bg-warning-soft text-warning-soft-foreground')}>
        <CloudUpload className="size-3.5" />
        {t('vocab.pending', { count: pending })}
      </span>
    );
  }
  return (
    <span className={cn(chip, 'bg-success-soft text-success-soft-foreground')}>
      <CloudCheck className="size-3.5" />
      {t('vocab.synced')}
    </span>
  );
}

const VocabRow = memo(function VocabRow({
  entry,
  onOpen,
  onDelete,
}: {
  entry: VocabEntry;
  onOpen: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-1 rounded-2xl border bg-card shadow-xs transition hover:border-primary/50">
      <button
        type="button"
        onClick={() => onOpen(entry.key)}
        className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{entry.term}</span>
          <KindChip entry={entry} />
        </span>
        <MeaningState entry={entry} compact />
        {entry.context ? (
          <span className="truncate text-xs text-muted-foreground">{entry.context}</span>
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(entry.key)}
        aria-label={`${t('vocab.delete')} “${entry.term}”`}
        title={t('vocab.delete')}
        className="mr-2 text-muted-foreground hover:bg-destructive-soft hover:text-destructive-soft-foreground"
      >
        <Trash2 className="size-[18px]" />
      </Button>
    </li>
  );
});

/** Part of speech when known (words), else the kind (phrase, sentence). */
function KindChip({ entry }: { entry: Pick<VocabEntry, 'kind' | 'partOfSpeech'> }) {
  const { t } = useTranslation();
  return (
    <Badge variant={entry.partOfSpeech ? 'primary' : 'default'}>
      {entry.partOfSpeech ?? t(`vocab.kind.${entry.kind}`)}
    </Badge>
  );
}

/** Everything about one note: editable meaning, explanation, the sentence it came from, source. */
function VocabSheet({ entryKey, onClose }: { entryKey: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const entry = useVocabEntry(entryKey);
  const [isEditing, setIsEditing] = useState(false);
  const isShown = entry !== undefined && !entry.deleted;

  // Deleted (here, or elsewhere and synced): close for good, so an undo doesn't reopen it.
  useEffect(() => {
    if (entryKey !== null && !isShown) onClose();
  }, [entryKey, isShown, onClose]);
  // Each note opens on its meaning, not on the editor left open for the previous one.
  useEffect(() => {
    setIsEditing(false);
  }, [entryKey]);

  return (
    <Sheet open={entryKey !== null && isShown} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        className="overflow-y-auto p-5"
        // Escape leaves the editor first, then the sheet.
        onEscapeKeyDown={(event) => {
          if (!isEditing) return;
          event.preventDefault();
          setIsEditing(false);
        }}
      >
        {entry ? (
          <VocabDetails
            entry={entry}
            isEditing={isEditing}
            onEdit={setIsEditing}
            onDelete={() => {
              onClose();
              deleteNoteWithUndo(entry.key, t);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function VocabDetails({
  entry,
  isEditing,
  onEdit,
  onDelete,
}: {
  entry: VocabEntry;
  isEditing: boolean;
  onEdit: (isEditing: boolean) => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const notedOn = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(entry.createdAt),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 pr-8">
        <SheetTitle className="text-xl break-words">{entry.term}</SheetTitle>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{t(`vocab.kind.${entry.kind}`)}</Badge>
          {entry.partOfSpeech ? <Badge variant="primary">{entry.partOfSpeech}</Badge> : null}
        </div>
        <SheetDescription className="sr-only">{t('vocab.meaning')}</SheetDescription>
      </div>

      <DetailSection
        title={t('vocab.meaning')}
        action={
          isEditing ? null : (
            <Button variant="ghost" size="sm" onClick={() => onEdit(true)}>
              <Pencil />
              {entry.meaning ? t('vocab.editMeaning') : t('vocab.addMeaning')}
            </Button>
          )
        }
      >
        {isEditing ? (
          <MeaningEditor entry={entry} onDone={() => onEdit(false)} />
        ) : (
          <MeaningState entry={entry} />
        )}
      </DetailSection>

      {entry.explanation ? (
        <DetailSection title={t('vocab.explanation')}>
          <p className="text-sm leading-relaxed">{entry.explanation}</p>
        </DetailSection>
      ) : null}

      {entry.context ? (
        <DetailSection title={t('vocab.context')}>
          <p className="rounded-2xl bg-secondary p-3 text-sm leading-relaxed">
            <TermInContext text={entry.context} termKey={entry.key} />
          </p>
        </DetailSection>
      ) : null}

      <DetailSection title={t('vocab.source')}>
        {entry.sourceTitle ? <p className="text-sm font-medium">{entry.sourceTitle}</p> : null}
        <p className="text-xs text-muted-foreground">{t('vocab.notedOn', { date: notedOn })}</p>
      </DetailSection>

      <Button variant="destructive-soft" size="lg" onClick={onDelete}>
        <Trash2 />
        {t('vocab.delete')}
      </Button>
    </div>
  );
}

function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The context sentence with the term in bold (matched like the underlines: whole words, any case). */
function TermInContext({ text, termKey }: { text: string; termKey: string }) {
  const parts = useMemo(() => segment(text, buildMatcher([termKey])), [text, termKey]);
  return parts.map((part) =>
    part.key === undefined ? (
      <Fragment key={part.start}>{part.text}</Fragment>
    ) : (
      <strong key={part.start} className="font-semibold text-foreground">
        {part.text}
      </strong>
    ),
  );
}
