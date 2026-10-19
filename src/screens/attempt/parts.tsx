import { ChevronLeft, Flag, Timer } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { GradientProgress } from '@/components/app/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StripItem = { id: string; isAnswered: boolean; isFlagged: boolean };

/** Row of question numbers: answered ones are filled, flagged ones get a warning ring. */
export function QuestionStrip({
  items,
  currentIndex,
  onSelect,
}: {
  items: StripItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cell = listRef.current?.children[currentIndex] as HTMLElement | undefined;
    cell?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentIndex]);

  return (
    <div
      ref={listRef}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:thin]"
    >
      {items.map((item, index) => {
        const isCurrent = index === currentIndex;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition',
              isCurrent
                ? 'bg-primary text-primary-foreground'
                : item.isAnswered
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-accent',
              item.isFlagged ? 'border-warning' : 'border-transparent',
            )}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

/** "Question 3 / 40 · 12/40 answered" with the gradient progress bar. */
export function QuestionProgress({
  index,
  count,
  answered,
}: {
  index: number;
  count: number;
  answered: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 pt-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-semibold">
            {t('sectioned.questionNumber', { current: index + 1 })}
          </span>
          <span className="text-sm text-muted-foreground">{`/ ${count}`}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t('attempt.answered', { answered, total: count })}
        </span>
      </div>
      <GradientProgress percent={Math.round((answered / Math.max(count, 1)) * 100)} />
    </div>
  );
}

export function PrevButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size="icon-lg"
      disabled={disabled}
      onClick={onClick}
      aria-label={t('attempt.prev')}
      title={`${t('attempt.prev')} (←)`}
    >
      <ChevronLeft className="size-5" />
    </Button>
  );
}

export function FlagButton({ flagged, onClick }: { flagged: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={onClick}
      aria-pressed={flagged}
      title={`${flagged ? t('attempt.flagged') : t('attempt.flag')} (F)`}
      className={cn(flagged && 'bg-warning-soft text-warning-soft-foreground hover:bg-warning/25')}
    >
      <Flag className={cn(flagged && 'fill-current')} />
      {t('sectioned.flagShort')}
    </Button>
  );
}

/** Time left; turns to warning under 5 minutes and danger under 1 minute. */
export function TimerBadge({ ms }: { ms: number | null }) {
  const level =
    ms !== null && ms <= 60_000 ? 'danger' : ms !== null && ms <= 5 * 60_000 ? 'warning' : 'normal';
  const totalSeconds = ms === null ? 0 : Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold tabular-nums',
        level === 'danger'
          ? 'bg-destructive-soft text-destructive'
          : level === 'warning'
            ? 'bg-warning-soft text-warning-soft-foreground'
            : 'bg-secondary',
      )}
    >
      <Timer className="size-4" />
      {ms === null ? '' : text}
    </span>
  );
}
