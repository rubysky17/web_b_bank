import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';

import { useRegister } from '@/api/auth';
import { describeError } from '@/api/errors';
import { FormTextField } from '@/components/form/form-text-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AuthLayout } from '@/screens/login/auth-layout';

import { createRegisterSchema, type RegisterValues } from './schema';

const DEFAULT_VALUES: RegisterValues = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export function RegisterScreen() {
  const { t } = useTranslation();
  const { mutate: register, isPending, error } = useRegister();
  const { control, handleSubmit } = useForm<
    RegisterValues,
    unknown,
    z.output<ReturnType<typeof createRegisterSchema>>
  >({
    resolver: zodResolver(createRegisterSchema(t)),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={handleSubmit(({ fullName, email, password }) =>
          register({ fullName, email, password }),
        )}
      >
        <FormTextField
          control={control}
          name="fullName"
          label={t('auth.fullName')}
          placeholder={t('auth.fullNamePlaceholder')}
          autoComplete="name"
          autoFocus
        />
        <FormTextField
          control={control}
          name="email"
          type="email"
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          autoComplete="username"
        />
        <FormTextField
          control={control}
          name="password"
          type="password"
          label={t('auth.password')}
          placeholder={t('auth.newPasswordPlaceholder')}
          autoComplete="new-password"
        />
        <FormTextField
          control={control}
          name="confirmPassword"
          type="password"
          label={t('auth.confirmPassword')}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          autoComplete="new-password"
        />
        {error ? <p className="text-sm text-destructive">{describeError(error, t)}</p> : null}
        <Button type="submit" variant="brand" size="lg" disabled={isPending}>
          {isPending ? <Spinner className="text-on-brand" /> : null}
          {t('auth.registerSubmit')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.submit')}
        </Link>
      </p>
    </AuthLayout>
  );
}
