import type { TFunction } from 'i18next';

import { createRegisterSchema } from './schema';

// Echo the key so assertions can check which message was picked.
const t = ((key: string) => key) as unknown as TFunction;
const schema = createRegisterSchema(t);

const valid = {
  fullName: ' Nguyễn Văn A ',
  email: ' A@Example.com ',
  password: 'secret-123',
  confirmPassword: 'secret-123',
};

const messages = (values: Record<string, string>) => {
  const result = schema.safeParse(values);
  return result.success ? {} : result.error.flatten().fieldErrors;
};

describe('register schema', () => {
  it('accepts a valid form, trims the name and normalizes the email', () => {
    expect(schema.parse(valid)).toMatchObject({
      fullName: 'Nguyễn Văn A',
      email: 'a@example.com',
    });
  });

  it('requires a name, a valid email and an 8+ character password', () => {
    expect(
      messages({
        ...valid,
        fullName: '  ',
        email: 'nope',
        password: 'short',
        confirmPassword: 'short',
      }),
    ).toEqual({
      fullName: ['auth.validation.fullNameRequired'],
      email: ['auth.validation.emailInvalid'],
      password: ['auth.validation.passwordMin'],
    });
  });

  it('reports a mismatched confirmation on that field', () => {
    expect(messages({ ...valid, confirmPassword: 'secret-124' })).toEqual({
      confirmPassword: ['auth.validation.passwordMismatch'],
    });
  });
});
