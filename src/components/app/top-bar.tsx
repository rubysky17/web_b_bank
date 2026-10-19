import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useBack } from '@/hooks/use-back';
import { cn } from '@/lib/utils';

type TopBarProps = {
  title: string;
  subtitle?: string;
  /** Right side: the clock, the pause button… */
  accessory?: ReactNode;
  /** Where "back" goes when the page was opened directly (no history). */
  fallback?: string;
  /** Hide the back button (e.g. while a section clock runs). */
  hideBack?: boolean;
  className?: string;
};

/** Top bar of the focus screens (Figma v2 "Attempt"): back, title over subtitle, accessory. */
export function TopBar({ title, subtitle, accessory, fallback, hideBack, className }: TopBarProps) {
  const { t } = useTranslation();
  const back = useBack(fallback);
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex items-center gap-3 border-b bg-background/90 py-3 backdrop-blur',
        className,
      )}
    >
      {hideBack ? null : (
        <Button
          variant="outline"
          size="icon"
          onClick={back}
          aria-label={t('common.back')}
          className="shrink-0"
        >
          <ChevronLeft className="size-5" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {accessory}
    </header>
  );
}

/** Bottom bar holding a screen's actions; sticks to the bottom of the viewport. */
export function ActionBar({
  children,
  direction = 'row',
  className,
}: {
  children: ReactNode;
  direction?: 'row' | 'column';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 mt-auto flex gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:mx-0 md:rounded-t-3xl md:border-x md:px-4',
        direction === 'row' ? 'items-center' : 'flex-col',
        className,
      )}
    >
      {children}
    </div>
  );
}
