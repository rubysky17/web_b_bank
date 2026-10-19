import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** null = no cancel button (a plain notice). */
  cancelLabel?: string | null;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/**
 * `Alert.alert` for the web: `if (await confirm({ title, message })) …`. One dialog at a time,
 * rendered by <ConfirmHost/> (mounted once by the app providers).
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { ...options, resolve } });
  });
}

/** A notice with a single OK button. */
export const notify = (title: string, message?: string) =>
  confirm({ title, message, cancelLabel: null }).then(() => undefined);

export function ConfirmHost() {
  const { t } = useTranslation();
  const pending = useConfirmStore((s) => s.pending);
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    useConfirmStore.setState({ pending: null });
  };
  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : close(false))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.message ? (
            <AlertDialogDescription>{pending.message}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">{pending?.title}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {pending?.cancelLabel === null ? null : (
            <AlertDialogCancel onClick={() => close(false)}>
              {pending?.cancelLabel ?? t('common.cancel')}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={() => close(true)}
            className={buttonVariants({ variant: pending?.destructive ? 'destructive' : 'brand' })}
          >
            {pending?.confirmLabel ?? 'OK'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
