import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { shouldRetryRequest } from '@/api/errors';
import { createLogger } from '@/lib/logger';

const log = createLogger('query');

// TanStack Query already listens to window focus and online/offline events in the browser.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => log.warn('query failed', query.queryKey, error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      log.warn('mutation failed', mutation.options.mutationKey, error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: shouldRetryRequest,
    },
    mutations: {
      retry: false,
    },
  },
});
