import '@/lib/firebase';
import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { startAttemptSync } from '@/api/attempt-sync';
import { startVocabSync } from '@/api/vocab-sync';
import { ConfirmHost } from '@/components/app/confirm';
import { Toaster } from '@/components/ui/sonner';

import { queryClient } from './query-client';
import { startSettingsSync } from './settings-sync';

startSettingsSync();
startAttemptSync();
startVocabSync();

/** Every app-wide provider, outermost first. Add new ones here, not in route files. */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ConfirmHost />
      <Toaster />
    </QueryClientProvider>
  );
}
