import type { LucideIcon } from 'lucide-react';
import type { FormEventHandler, ReactNode } from 'react';

import { IconTile, type Tone } from '@/components/app/icon-tile';
import { ActionBar, TopBar } from '@/components/app/top-bar';
import { FocusPage } from '@/components/layout/app-shell';

type AccountFormProps = {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  intro: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  /** The submit button(s), in the bottom action bar. */
  actions: ReactNode;
};

/** Layout shared by the account forms: top bar, an intro card, the fields, actions at the bottom. */
export function AccountForm({ title, icon, tone, intro, onSubmit, children, actions }: AccountFormProps) {
  return (
    <FocusPage className="max-w-xl">
      <TopBar title={title} fallback="/settings" />
      <form noValidate onSubmit={onSubmit} className="flex flex-1 flex-col">
        <div className="flex flex-col gap-5 pt-4 pb-6">
          <div className="flex items-center gap-3 rounded-3xl border bg-card p-4">
            <IconTile tone={tone} icon={icon} />
            <p className="flex-1 text-sm text-muted-foreground">{intro}</p>
          </div>
          {children}
        </div>
        <ActionBar>{actions}</ActionBar>
      </form>
    </FocusPage>
  );
}
