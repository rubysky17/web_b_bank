import type { TFunction } from 'i18next';
import { z } from 'zod';

/** Same limits as the server (POST /auth/register, PATCH /auth/me). */
export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export function createProfileSchema(t: TFunction) {
  return z.object({
    fullName: z.string().trim().min(1, t('auth.validation.fullNameRequired')).max(100),
  });
}
export type ProfileValues = z.input<ReturnType<typeof createProfileSchema>>;

export function createChangePasswordSchema(t: TFunction) {
  return z
    .object({
      currentPassword: z.string().min(1, t('auth.validation.passwordRequired')),
      newPassword: z
        .string()
        .min(PASSWORD_MIN, t('auth.validation.passwordMin', { count: PASSWORD_MIN }))
        .max(PASSWORD_MAX),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth.validation.passwordMismatch'),
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      path: ['newPassword'],
      message: t('account.samePassword'),
    });
}
export type ChangePasswordValues = z.input<ReturnType<typeof createChangePasswordSchema>>;

export function createDeleteAccountSchema(t: TFunction) {
  return z.object({ password: z.string().min(1, t('auth.validation.passwordRequired')) });
}
export type DeleteAccountValues = z.input<ReturnType<typeof createDeleteAccountSchema>>;
