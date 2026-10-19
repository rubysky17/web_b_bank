import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-3xl border bg-card p-4 text-card-foreground shadow-xs', className)}
      {...props}
    />
  );
}

export { Card };
