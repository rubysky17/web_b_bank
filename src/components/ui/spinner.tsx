import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn('size-5 animate-spin text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Spinner };
