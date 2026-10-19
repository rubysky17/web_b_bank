import ky from 'ky';
import { z } from 'zod';

import { env } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { useAuthStore } from '@/stores/auth-store';

import { toApiError } from './errors';

const log = createLogger('session');

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(['USER', 'HOST', 'ADMIN']),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

/** Body of POST /auth/login, POST /auth/register and POST /auth/refresh. */
export const AuthResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string(),
  /** Seconds. */
  accessTokenExpiresIn: z.number(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Bare client: refreshing must not go through the app client's 401 handling.
const authClient = ky.create({ baseUrl: env.API_URL, timeout: 15_000, retry: 0 });

let refreshing: Promise<string | null> | null = null;

/**
 * Exchanges the refresh token for a new pair and returns the new access token, or null when the
 * session is over (no refresh token, or the server rejected it). Concurrent callers share one
 * request: the server rotates the token, so two parallel refreshes would race.
 * Network errors are thrown, so a flaky connection does not sign the user out.
 */
export function refreshSession(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const session = await authClient
      .post('auth/refresh', { json: { refreshToken } })
      .json(AuthResponseSchema);
    await setTokens(session);
    return session.accessToken;
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === 'unauthorized') {
      log.info('refresh rejected', apiError.serverCode);
      return null;
    }
    throw apiError;
  }
}
