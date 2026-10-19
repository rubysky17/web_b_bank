import type { TFunction } from 'i18next';

import { createChangePasswordSchema, createProfileSchema } from './schema';

const t = ((key: string) => key) as unknown as TFunction;

describe('account schemas', () => {
  it('trims the name and requires one', () => {
    expect(createProfileSchema(t).parse({ fullName: '  An  ' })).toEqual({ fullName: 'An' });
    expect(createProfileSchema(t).safeParse({ fullName: '  ' }).success).toBe(false);
  });

  it('checks the new password length, the confirmation and that it changes', () => {
    const schema = createChangePasswordSchema(t);
    const ok = { currentPassword: 'old-pass', newPassword: 'new-pass-1', confirmPassword: 'new-pass-1' };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, newPassword: 'short', confirmPassword: 'short' }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...ok, confirmPassword: 'other-pass' }).success).toBe(false);
    expect(
      schema.safeParse({ currentPassword: 'same-pass', newPassword: 'same-pass', confirmPassword: 'same-pass' })
        .success,
    ).toBe(false);
  });
});
