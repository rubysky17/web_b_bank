import { type ReactNode, useId } from 'react';

type ProgressRingProps = {
  /** 0–100. */
  percent: number;
  size?: number;
  thickness?: number;
  /** `brand`: gradient arc on a neutral track. `on-brand`: white arc for gradient backgrounds. */
  variant?: 'brand' | 'on-brand';
  /** Shown in the middle, e.g. the percentage. */
  children?: ReactNode;
  label?: string;
};

/** Circular progress starting at the top, clockwise, with rounded ends. */
export function ProgressRing({
  percent,
  size = 132,
  thickness = 12,
  variant = 'brand',
  children,
  label,
}: ProgressRingProps) {
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const isOnBrand = variant === 'on-brand';
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const center = size / 2;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="relative flex shrink-0 flex-col items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand-start)" />
            <stop offset="1" stopColor="var(--brand-end)" />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={isOnBrand ? 'var(--on-brand-track)' : 'var(--secondary)'}
          strokeWidth={thickness}
          fill="none"
        />
        {clamped > 0 ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isOnBrand ? 'var(--on-brand)' : `url(#${id})`}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${(circumference * clamped) / 100} ${circumference}`}
            transform={`rotate(-90 ${center} ${center})`}
            fill="none"
            className="transition-[stroke-dasharray] duration-500"
          />
        ) : null}
      </svg>
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}
