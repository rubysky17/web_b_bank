import { create } from 'zustand';

import { storage } from './storage';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';

export type SessionTokens = { accessToken: string; refreshToken: string };

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  /** Saves a new token pair (sign-in and every refresh rotate both). */
  setTokens: (tokens: SessionTokens) => Promise<void>;
  signOut: () => Promise<void>;
};

/**
 * Tokens live in localStorage: browsers have no keychain, and the API returns tokens in the body
 * (no httpOnly cookie). Another tab signing in or out is picked up through the `storage` event.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: storage.getString(ACCESS_TOKEN_KEY) ?? null,
  refreshToken: storage.getString(REFRESH_TOKEN_KEY) ?? null,
  setTokens: async ({ accessToken, refreshToken }) => {
    storage.set(ACCESS_TOKEN_KEY, accessToken);
    storage.set(REFRESH_TOKEN_KEY, refreshToken);
    set({ accessToken, refreshToken });
  },
  signOut: async () => {
    storage.remove(ACCESS_TOKEN_KEY);
    storage.remove(REFRESH_TOKEN_KEY);
    set({ accessToken: null, refreshToken: null });
  },
}));

// Keep tabs in step: a refresh in one tab rotates the tokens for all of them.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith('qbank:auth.')) return;
    useAuthStore.setState({
      accessToken: storage.getString(ACCESS_TOKEN_KEY) ?? null,
      refreshToken: storage.getString(REFRESH_TOKEN_KEY) ?? null,
    });
  });
}

export const useIsSignedIn = () => useAuthStore((s) => s.accessToken !== null);
