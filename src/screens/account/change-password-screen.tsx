import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { useChangePassword } from '@/api/auth';
import { describeError, toApiError } from '@/api/errors';
import { notify } from '@/components/app/confirm';
import { FormTextField } from '@/components/form/form-text-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useBack } from '@/hooks/use-back';

import { AccountForm } from './account-form';
import { type ChangePasswordValues, createChangePasswordSchema, PASSWORD_MIN } from './schema';

const DEFAULT_VALUES: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const back = useBack('/settings');
  const { mutate: change, isPending, error } = useChangePassword();
  const { control, handleSubmit } = useForm<
    ChangePasswordValues,
    unknown,
    z.output<ReturnType<typeof createChangePasswordSchema>>
  >({ resolver: zodResolver(createChangePasswordSchema(t)), defaultValues: DEFAULT_VALUES });

  return (
    <AccountForm
      title={t('account.passwordTitle')}
      icon={Lock}
      tone="violet"
      intro={t('account.passwordIntro')}
      onSubmit={handleSubmit(({ currentPassword, newPassword }) =>
        change(
          { currentPassword, newPassword },
          {
            onSuccess: () =>
              void notify(t('account.passwordChanged'), t('account.passwordChangedHint')).then(
                back,
              ),
          },
        ),
      )}
      actions={
        <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={isPending}>
          {isPending ? <Spinner className="text-on-brand" /> : <Check />}
          {t('account.changePassword')}
        </Button>
      }
    >
      {/* Lets password managers tie the new password to the account. */}
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <FormTextField
        control={control}
        name="currentPassword"
        type="password"
        label={t('account.currentPassword')}
        placeholder={t('auth.passwordPlaceholder')}
        autoComplete="current-password"
        autoFocus
      />
      <FormTextField
        control={control}
        name="newPassword"
        type="password"
        label={t('account.newPassword')}
        placeholder={t('auth.validation.passwordMin', { count: PASSWORD_MIN })}
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
      {error ? (
        <p className="text-sm text-destructive">
          {toApiError(error).serverCode === 'WRONG_PASSWORD'
            ? t('account.wrongPassword')
            : describeError(error, t)}
        </p>
      ) : null}
    </AccountForm>
  );
}
