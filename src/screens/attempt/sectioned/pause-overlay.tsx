import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FeatureIcon } from '@/components/app/icon-tile';
import { Button } from '@/components/ui/button';
import { useBack } from '@/hooks/use-back';
import { getSession } from '@/stores/attempt-sessions';
import { formatClockMs } from '@/utils/format-duration';

/**
 * Covers the question while the clock is stopped, so a pause can't be used to read ahead. Shown
 * after the pause button, after coming back to the tab, and when the attempt is reopened.
 */
export function PauseOverlay({
  attemptId,
  examId,
  sectionTitle,
  onResume,
}: {
  attemptId: string;
  examId: string;
  sectionTitle: string;
  onResume: () => void;
}) {
  const { t } = useTranslation();
  const back = useBack(`/exams/${examId}`);
  const remaining = getSession(attemptId)?.remainingMs() ?? null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-background p-8 duration-200 animate-in fade-in">
      <FeatureIcon icon={Pause} />
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-bold">{t('sectioned.paused')}</h2>
        <p className="text-muted-foreground">
          {t('sectioned.pausedLeft', { title: sectionTitle, time: formatClockMs(remaining) ?? '' })}
        </p>
        <p className="text-sm text-muted-foreground">{t('sectioned.pausedHint')}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button variant="brand" size="lg" onClick={onResume} autoFocus>
          <Play className="fill-current" />
          {t('sectioned.resume')}
        </Button>
        <Button variant="secondary" size="lg" onClick={back}>
          {t('sectioned.saveAndExit')}
        </Button>
      </div>
    </div>
  );
}
