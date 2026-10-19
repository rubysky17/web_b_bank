import { cn } from '@/lib/utils';

type FilterPillProps = {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
};

/** Filter chip of the v2 lists: inverted (foreground) when selected, outlined otherwise. */
export function FilterPill({ label, isSelected, onPress, disabled, className }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={isSelected}
      className={cn(
        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition disabled:opacity-40',
        isSelected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card hover:bg-accent',
        className,
      )}
    >
      {label}
    </button>
  );
}

/** Horizontally scrolling row of pills (wraps on wide screens). */
export function PillRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
