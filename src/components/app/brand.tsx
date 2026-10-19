import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/** Soft white circle behind gradient content; position and size it with `className`. */
export function GradientGlow({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full bg-on-brand-faint', className)}
    />
  );
}

type BrandCardProps = {
  className?: string;
  children?: ReactNode;
};

/** A rounded card painted with the brand gradient (blue → violet), with a glow. */
export function BrandCard({ className, children }: BrandCardProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-brand-gradient p-5', className)}>
      <GradientGlow className="-top-16 -right-10 size-44" />
      <div className="relative flex flex-col gap-3">{children}</div>
    </div>
  );
}

type BrandHeroProps = {
  /** Shows a back button. */
  onBack?: () => void;
  /** Next to the back button (e.g. the screen name). */
  title?: string;
  /** Right side of the top row (e.g. a topic chip). */
  accessory?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** Gradient header of the detail screens (exam, result), rounded at the bottom. */
export function BrandHero({ onBack, title, accessory, children, className }: BrandHeroProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-brand-gradient px-5 pt-4 pb-6 text-on-brand md:rounded-3xl',
        'rounded-b-[28px]',
        className,
      )}
    >
      <GradientGlow className="-top-10 -right-14 size-56" />
      <div className="relative flex flex-col gap-3">
        {onBack || title || accessory ? (
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('common.back')}
                className="flex size-10 items-center justify-center rounded-full bg-on-brand-subtle transition hover:bg-on-brand-track"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : null}
            {title ? (
              <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
            ) : (
              <div className="flex-1" />
            )}
            {accessory}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** The Q Bank mark: a "Q" whose tail is a check mark (Figma "Brand · Logo"). */
export function LogoMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M60.5 67A25 25 0 1 1 67 52"
        fill="none"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinecap="round"
      />
      <path
        d="M44.5 62L55.5 73L78.5 45"
        fill="none"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo tile + wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex size-9 items-center justify-center rounded-[10px] bg-brand-gradient text-on-brand">
        <LogoMark size={26} />
      </div>
      <span className="text-lg font-bold">Q Bank</span>
    </div>
  );
}

/** Thin progress track with a gradient fill (0–100). */
export function GradientProgress({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className="h-full rounded-full bg-brand-gradient-x transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
