import { zodResolver } from '@hookform/resolvers/zod';
import { Check, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

import { useMe, useUpdateProfile } from '@/api/auth';
import { describeError } from '@/api/errors';
import { LoadingView } from '@/components/app/states';
import { FormTextField } from '@/components/form/form-text-field';
import { FocusPage } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useBack } from '@/hooks/use-back';

import { AccountForm } from './account-form';
import { createProfileSchema, type ProfileValues } from './schema';

export function ProfileScreen() {
  const { data: me } = useMe();
  if (!me) {
    return (
      <FocusPage>
        <LoadingView />
      </FocusPage>
    );
  }
  // Keyed form: the default value is the name as it was when the screen opened.
  return <ProfileForm key={me.id} fullName={me.fullName} email={me.email} />;
}

function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const { t } = useTranslation();
  const back = useBack('/settings');
  const { mutate: save, isPending, error } = useUpdateProfile();
  const { control, handleSubmit } = useForm<
    ProfileValues,
    unknown,
    z.output<ReturnType<typeof createProfileSchema>>
  >({ resolver: zodResolver(createProfileSchema(t)), defaultValues: { fullName } });

  return (
    <AccountForm
      title={t('account.profileTitle')}
      icon={UserRound}
      tone="blue"
      intro={t('account.profileIntro', { email })}
      onSubmit={handleSubmit((values) =>
        save(values, {
          onSuccess: () => {
            toast.success(t('account.save'));
            back();
          },
        }),
      )}
      actions={
        <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={isPending}>
          {isPending ? <Spinner className="text-on-brand" /> : <Check />}
          {t('account.save')}
        </Button>
      }
    >
      <FormTextField
        control={control}
        name="fullName"
        label={t('auth.fullName')}
        placeholder={t('auth.fullNamePlaceholder')}
        autoComplete="name"
        autoFocus
      />
      {error ? <p className="text-sm text-destructive">{describeError(error, t)}</p> : null}
    </AccountForm>
  );
}
