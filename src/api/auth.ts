import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { getDeviceInfo } from '@/lib/device';
import { useAuthStore } from '@/stores/auth-store';
import { clearVocabUser, useVocabStore } from '@/stores/vocab-store';

import { api, endSession } from './client';
import { queryKeys } from './query-keys';
import { AuthResponseSchema, UserSchema } from './session';

export { type User, UserSchema } from './session';

export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { fullName: string };

export const meQueryOptions = queryOptions({
  queryKey: queryKeys.auth.me,
  queryFn: ({ signal }) => api.get('auth/me', { signal }).json(UserSchema),
  staleTime: 5 * 60_000,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setTokens = useAuthStore((s) => s.setTokens);

  return useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: (input: LoginInput) =>
      api.post('auth/login', { json: { ...input, ...getDeviceInfo() } }).json(AuthResponseSchema),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.auth.me, session.user);
      await setTokens(session);
    },
  });
}

/** Creates a USER account (POST /auth/register) and signs it in right away. */
export function useRegister() {
  const queryClient = useQueryClient();
  const setTokens = useAuthStore((s) => s.setTokens);

  return useMutation({
    mutationKey: ['auth', 'register'],
    mutationFn: (input: RegisterInput) =>
      api
        .post('auth/register', { json: { ...input, ...getDeviceInfo() } })
        .json(AuthResponseSchema),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.auth.me, session.user);
      await setTokens(session);
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationKey: ['auth', 'logout'],
    mutationFn: async () => {
      // Best effort: end the server session too, but never keep the user signed in on failure.
      await api.post('auth/logout').catch(() => undefined);
      await endSession();
    },
  });
}

/** PATCH /auth/me: the new profile replaces the cached one. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['auth', 'profile'],
    mutationFn: (input: { fullName: string }) =>
      api.patch('auth/me', { json: input }).json(UserSchema),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.auth.me, user),
  });
}

const ReauthSchema = z.object({ reauthToken: z.string(), expiresIn: z.number() });

/**
 * Sensitive changes confirm the password first (POST /auth/reauth, a short-lived token), so the
 * server never has to hash twice in one request.
 */
const reauth = (password: string) =>
  api.post('auth/reauth', { json: { password } }).json(ReauthSchema);

/** Changes the password; the server signs out every other device. */
export function useChangePassword() {
  return useMutation({
    mutationKey: ['auth', 'change-password'],
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordInput) => {
      const { reauthToken } = await reauth(currentPassword);
      await api.post('auth/change-password', { json: { reauthToken, newPassword } });
    },
  });
}

export type ChangePasswordInput = { currentPassword: string; newPassword: string };

/** Ends every session of the account (this device too), then signs out here. */
export function useLogoutAll() {
  return useMutation({
    mutationKey: ['auth', 'logout-all'],
    mutationFn: async () => {
      await api.post('auth/logout-all');
      await endSession();
    },
  });
}

/** Deletes the account (students only) with its attempts, then signs out. */
export function useDeleteAccount() {
  return useMutation({
    mutationKey: ['auth', 'delete'],
    mutationFn: async (password: string) => {
      const { reauthToken } = await reauth(password);
      await api.delete('auth/me', { json: { reauthToken } });
      const userId = useVocabStore.getState().userId;
      if (userId) clearVocabUser(userId);
      await endSession();
    },
  });
}
