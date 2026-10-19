import type { TFunction } from 'i18next';
import { z } from 'zod';

/** Built with `t` so validation messages follow the current language. */
export function createLoginSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email(t('auth.validation.emailInvalid'))),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
  });
}

export type LoginValues = z.input<ReturnType<typeof createLoginSchema>>;
