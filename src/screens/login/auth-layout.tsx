import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { GradientGlow, LogoMark } from '@/components/app/brand';

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

/**
 * Sign-in and sign-up: the gradient hero on top with the form sheet overlapping it on phones;
 * side by side (brand panel left, form right) on wide screens.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="relative overflow-hidden bg-brand-gradient px-6 pt-12 pb-16 text-on-brand lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        <GradientGlow className="-top-16 -right-12 size-56 lg:size-96" />
        <GradientGlow className="top-40 -left-12 size-36 lg:top-auto lg:bottom-20 lg:size-64" />
        <div className="relative flex flex-col gap-2 duration-500 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 pb-4">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-on-brand-subtle">
              <LogoMark size={26} />
            </div>
            <span className="text-lg font-bold">Q Bank</span>
          </div>
          <h1 className="text-3xl font-bold lg:hidden">{title}</h1>
          <p className="text-on-brand-muted lg:hidden">{subtitle}</p>
        </div>
        <div className="relative hidden max-w-md flex-col gap-3 lg:flex">
          <div className="flex size-20 items-center justify-center rounded-[24px] border border-on-brand-subtle bg-on-brand-subtle">
            <LogoMark size={60} />
          </div>
          <p className="text-4xl leading-tight font-bold">Q Bank</p>
          <p className="text-lg text-on-brand-muted">{t('splash.tagline')}</p>
        </div>
      </div>
      <div className="relative z-10 -mt-7 flex flex-1 flex-col rounded-t-[28px] bg-background px-5 pt-6 pb-10 lg:mt-0 lg:items-center lg:justify-center lg:rounded-none lg:p-12">
        <div className="flex w-full max-w-md flex-col gap-5 duration-500 animate-in fade-in slide-in-from-bottom-4">
          <div className="hidden flex-col gap-1 lg:flex">
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
