import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';

import { useLogin } from '@/api/auth';
import { describeError } from '@/api/errors';
import { FormTextField } from '@/components/form/form-text-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { AuthLayout } from './auth-layout';
import { createLoginSchema, type LoginValues } from './schema';

const DEFAULT_VALUES: LoginValues = { email: '', password: '' };

export function LoginScreen() {
  const { t } = useTranslation();
  const { mutate: login, isPending, error } = useLogin();
  const { control, handleSubmit } = useForm<
    LoginValues,
    unknown,
    z.output<ReturnType<typeof createLoginSchema>>
  >({
    resolver: zodResolver(createLoginSchema(t)),
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <AuthLayout title={t('auth.welcomeBack')} subtitle={t('auth.welcomeSubtitle')}>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={handleSubmit((values) => login(values))}
      >
        <FormTextField
          control={control}
          name="email"
          type="email"
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          autoComplete="email"
          autoFocus
        />
        <FormTextField
          control={control}
          name="password"
          type="password"
          label={t('auth.password')}
          placeholder={t('auth.passwordPlaceholder')}
          autoComplete="current-password"
        />
        {error ? <p className="text-sm text-destructive">{describeError(error, t)}</p> : null}
        <Button type="submit" variant="brand" size="lg" disabled={isPending}>
          {isPending ? <Spinner className="text-on-brand" /> : null}
          {t('auth.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          {t('auth.registerLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
