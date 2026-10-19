import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/** One tone per chart series color (green and red stay reserved for correct and wrong). */
export const TONES = ['blue', 'orange', 'violet', 'amber', 'pink'] as const;
export type Tone = (typeof TONES)[number];

// Literal class names so Tailwind generates them.
const TONE_CLASS = {
  blue: 'bg-chart-1-soft text-chart-1',
  orange: 'bg-chart-2-soft text-chart-2',
  violet: 'bg-chart-3-soft text-chart-3',
  amber: 'bg-chart-4-soft text-chart-4',
  pink: 'bg-chart-5-soft text-chart-5',
} as const satisfies Record<Tone, string>;

/** A stable tone for a key (topic, exam id…), so the same exam always gets the same color. */
export function toneFor(key: string): Tone {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length]!;
}

const SIZES = {
  sm: { box: 'size-9 rounded-xl', icon: 'size-[18px]' },
  md: { box: 'size-11 rounded-2xl', icon: 'size-[22px]' },
  lg: { box: 'size-16 rounded-3xl', icon: 'size-8' },
} as const;

type IconTileProps = {
  icon: LucideIcon;
  tone: Tone;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Rounded square with a tinted background and the icon in the tone's color. */
export function IconTile({ icon: Icon, tone, size = 'md', className }: IconTileProps) {
  const { box, icon } = SIZES[size];
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center', box, TONE_CLASS[tone], className)}
    >
      <Icon className={icon} />
    </div>
  );
}

/** Large icon on the brand gradient with a soft halo: the focal point of status screens. */
export function FeatureIcon({ icon: Icon, size = 88 }: { icon: LucideIcon; size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-full bg-primary-soft p-3">
      <div
        className="flex items-center justify-center rounded-full bg-brand-gradient text-on-brand"
        style={{ width: size, height: size }}
      >
        <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    </div>
  );
}
