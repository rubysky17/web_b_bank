import type { TFunction } from 'i18next';
import { z } from 'zod';

/** Same limit as the API (back_q_bank: PASSWORD_MIN_LENGTH). */
export const PASSWORD_MIN_LENGTH = 8;

/** Built with `t` so validation messages follow the current language. */
export function createRegisterSchema(t: TFunction) {
  return z
    .object({
      fullName: z.string().trim().min(1, t('auth.validation.fullNameRequired')).max(100),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email(t('auth.validation.emailInvalid'))),
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t('auth.validation.passwordMin', { count: PASSWORD_MIN_LENGTH }))
        .max(128),
      confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth.validation.passwordMismatch'),
    });
}

export type RegisterValues = z.input<ReturnType<typeof createRegisterSchema>>;
