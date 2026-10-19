import { useState } from 'react';
import { useParams } from 'react-router';

import { type AttemptView, useAttempt } from '@/api/attempts';
import { ErrorView, LoadingView } from '@/components/app/states';
import { FocusPage } from '@/components/layout/app-shell';
import { hasLocalSession, sessionFromView } from '@/stores/attempt-sessions';

import { LegacyAttemptScreen } from './legacy-attempt';
import { SectionedAttemptScreen } from './sectioned';

export function AttemptRoute() {
  const { id = '' } = useParams();
  return <AttemptScreen key={id} id={id} />;
}

/**
 * Sectioned attempts kept in this browser open straight from it (offline too); anything else is
 * read from the server first.
 */
function AttemptScreen({ id }: { id: string }) {
  const [isLocal] = useState(() => hasLocalSession(id));
  return isLocal ? <SectionedAttemptScreen id={id} /> : <RemoteAttempt id={id} />;
}

function RemoteAttempt({ id }: { id: string }) {
  const { data: attempt, error, isPending, refetch } = useAttempt(id);

  if (isPending) {
    return (
      <FocusPage>
        <LoadingView />
      </FocusPage>
    );
  }
  if (!attempt) {
    return (
      <FocusPage>
        <ErrorView error={error} onRetry={refetch} />
      </FocusPage>
    );
  }
  if (attempt.mode === 'SECTIONED' && attempt.status === 'IN_PROGRESS') {
    return <TakeOver view={attempt} />;
  }
  return <LegacyAttemptScreen id={id} />;
}

/** First open in this browser (new attempt, or one started elsewhere): keep it here from now on. */
function TakeOver({ view }: { view: AttemptView }) {
  useState(() => sessionFromView(view));
  return <SectionedAttemptScreen id={view.id} />;
}
