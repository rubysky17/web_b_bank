import ky from 'ky';

import { env } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { queryClient } from '@/providers/query-client';
import { useAuthStore } from '@/stores/auth-store';

import { refreshSession } from './session';

const log = createLogger('api');

/** Signs out and wipes every cached query so the next user starts clean. */
export async function endSession() {
  await useAuthStore.getState().signOut();
  queryClient.clear();
}

/** 401 from these means wrong credentials or a dead refresh token, not an expired access token. */
const isAuthRequest = (url: string) => /\/auth\/(login|refresh)(\?|$)/.test(url);

/**
 * Shared HTTP client for the Q Bank API. Usage: `api.get('catalog/exams').json(Schema)` — passing
 * a zod schema validates the response and types the result.
 *
 * An expired access token is refreshed once and the request replayed; if the session cannot be
 * refreshed the user is signed out (Stack.Protected then shows the login screen).
 */
export const api = ky.create({
  baseUrl: env.API_URL,
  timeout: 15_000,
  // TanStack Query owns retries. `limit: 1` with no methods only allows the forced retry below
  // (ky.retry skips the method check), never an automatic one.
  retry: { limit: 1, methods: [] },
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = useAuthStore.getState().accessToken;
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
        log.debug('→', request.method, request.url);
      },
    ],
    afterResponse: [
      async ({ request, response, retryCount }) => {
        log.debug('←', response.status, request.method, request.url);
        if (response.status !== 401 || isAuthRequest(request.url)) return;
        if (!useAuthStore.getState().accessToken) return;

        // Still 401 with a fresh token: the session really ended.
        if (retryCount > 0) {
          await endSession();
          return;
        }
        const accessToken = await refreshSession();
        if (!accessToken) {
          await endSession();
          return;
        }
        const headers = new Headers(request.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return ky.retry({ request: new Request(request, { headers }), code: 'TOKEN_REFRESHED' });
      },
    ],
  },
});
