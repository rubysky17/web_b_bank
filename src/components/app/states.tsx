import { CloudOff, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { FeatureIcon, IconTile } from './icon-tile';

export function EmptyView({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <IconTile tone="blue" icon={Inbox} size="lg" />
      <p className="text-muted-foreground">{message ?? t('common.empty')}</p>
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 py-16 text-center">
      <FeatureIcon icon={CloudOff} size={72} />
      <p className="text-muted-foreground">{describeError(error, t)}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={() => onRetry()}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

/** Generic placeholder while a screen loads: a header block and a few cards. */
export function LoadingView() {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Skeleton className="h-6 w-40 rounded-full" />
      <Skeleton className="h-36 rounded-3xl" />
      <Skeleton className="h-24 rounded-3xl" />
      <Skeleton className="h-24 rounded-3xl" />
    </div>
  );
}

export function CenteredSpinner() {
  return (
    <div className="flex justify-center py-6">
      <Spinner />
    </div>
  );
}
