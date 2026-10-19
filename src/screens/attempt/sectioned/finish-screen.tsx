import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { type SyncOutcome, syncAttempt } from '@/api/attempt-sync';
import { FeatureIcon } from '@/components/app/icon-tile';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useBack } from '@/hooks/use-back';

/**
 * The attempt is handed in (or abandoned) in the browser; this uploads it and shows the result.
 * Offline, everything stays in the browser and is uploaded and submitted by itself once the
 * network is back.
 */
export function FinishScreen({ id, closing }: { id: string; closing: 'SUBMIT' | 'ABANDON' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = useBack('/');
  const [outcome, setOutcome] = useState<SyncOutcome | 'RUNNING'>('RUNNING');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void syncAttempt(id).then((result) => {
      if (!alive) return;
      setOutcome(result);
      if (result === 'DONE' || result === 'CLOSED') {
        if (closing === 'SUBMIT') void navigate(`/attempts/${id}/result`, { replace: true });
        else back();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run per retry only
  }, [id, attempt]);

  if (outcome === 'RUNNING' || outcome === 'DONE' || outcome === 'CLOSED') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8">
        <FeatureIcon icon={CloudUpload} />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          {t('sectioned.uploading')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <FeatureIcon icon={CloudOff} />
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-bold">
          {closing === 'SUBMIT' ? t('sectioned.savedOfflineSubmit') : t('sectioned.savedOffline')}
        </h2>
        <p className="text-muted-foreground">{t('sectioned.savedOfflineHint')}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          variant="brand"
          size="lg"
          onClick={() => {
            setOutcome('RUNNING');
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw />
          {t('common.retry')}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => void navigate('/', { replace: true })}>
          {t('common.goHome')}
        </Button>
      </div>
    </div>
  );
}
