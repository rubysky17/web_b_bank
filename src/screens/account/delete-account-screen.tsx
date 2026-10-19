import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { useDeleteAccount } from '@/api/auth';
import { describeError, toApiError } from '@/api/errors';
import { confirm } from '@/components/app/confirm';
import { FormTextField } from '@/components/form/form-text-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { AccountForm } from './account-form';
import { createDeleteAccountSchema, type DeleteAccountValues } from './schema';

/** Error codes shown in the app language instead of the server's English message. */
const KNOWN_ERRORS = {
  WRONG_PASSWORD: 'account.wrongPassword',
  ACCOUNT_NOT_DELETABLE: 'account.notDeletable',
} as const;

export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { mutate: remove, isPending, error } = useDeleteAccount();
  const { control, handleSubmit } = useForm<
    DeleteAccountValues,
    unknown,
    z.output<ReturnType<typeof createDeleteAccountSchema>>
  >({ resolver: zodResolver(createDeleteAccountSchema(t)), defaultValues: { password: '' } });

  const code = error ? toApiError(error).serverCode : undefined;
  const known = code && code in KNOWN_ERRORS ? KNOWN_ERRORS[code as keyof typeof KNOWN_ERRORS] : null;

  return (
    <AccountForm
      title={t('account.deleteTitle')}
      icon={Trash2}
      tone="pink"
      intro={t('account.deleteIntro')}
      // Signing out (in the mutation) sends the app back to the login page by itself.
      onSubmit={handleSubmit(async ({ password }) => {
        const ok = await confirm({
          title: t('account.deleteConfirmTitle'),
          message: t('account.deleteConfirmMessage'),
          confirmLabel: t('account.delete'),
          destructive: true,
        });
        if (ok) remove(password);
      })}
      actions={
        <Button type="submit" variant="destructive" size="lg" className="flex-1" disabled={isPending}>
          {isPending ? <Spinner className="text-white" /> : null}
          {t('account.delete')}
        </Button>
      }
    >
      <FormTextField
        control={control}
        name="password"
        type="password"
        label={t('auth.password')}
        placeholder={t('auth.passwordPlaceholder')}
        autoComplete="current-password"
        autoFocus
      />
      {error ? (
        <p className="text-sm text-destructive">{known ? t(known) : describeError(error, t)}</p>
      ) : null}
    </AccountForm>
  );
}
