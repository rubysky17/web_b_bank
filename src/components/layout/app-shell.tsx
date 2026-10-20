import {
  BookA,
  ChartColumn,
  FileText,
  History,
  ListChecks,
  type LucideIcon,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useMe } from '@/api/auth';
import { Wordmark } from '@/components/app/brand';
import { cn } from '@/lib/utils';

type Tab = {
  to: string;
  icon: LucideIcon;
  label: 'home' | 'bank' | 'vocab' | 'history' | 'reports';
};

/** Five tabs at most, like the Android app. Settings opens from the user card / the home header. */
const TABS: readonly Tab[] = [
  { to: '/', icon: FileText, label: 'home' },
  { to: '/bank', icon: ListChecks, label: 'bank' },
  { to: '/vocab', icon: BookA, label: 'vocab' },
  { to: '/history', icon: History, label: 'history' },
  { to: '/reports', icon: ChartColumn, label: 'reports' },
];

/**
 * Signed-in layout: a sidebar from `md` up; on phones a bottom tab bar, shown on the five tab
 * screens only (detail screens, Settings included, have their own top bar, like a native stack).
 */
export function AppShell() {
  const { pathname } = useLocation();
  const isTab = TABS.some((tab) => tab.to === pathname);

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className={cn('md:pl-64', isTab && 'pb-20 md:pb-0')}>
        <Outlet />
      </main>
      {isTab ? <BottomTabs /> : null}
    </div>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r bg-card px-4 py-6 md:flex">
      <Wordmark className="px-2" />
      <nav className="flex flex-col gap-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <tab.icon className="size-5" />
            {t(`tabs.${tab.label}`)}
          </NavLink>
        ))}
      </nav>
      {me ? (
        <NavLink
          to="/settings"
          title={t('settings.title')}
          className={({ isActive }) =>
            cn(
              'mt-auto flex items-center gap-3 rounded-2xl p-2 transition',
              isActive ? 'bg-primary-soft' : 'hover:bg-accent',
            )
          }
        >
          <Avatar name={me.fullName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{me.email}</p>
          </div>
          <Settings className="size-[18px] shrink-0 text-muted-foreground" />
        </NavLink>
      ) : null}
    </aside>
  );
}

function BottomTabs() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex h-7 w-14 items-center justify-center rounded-full transition',
                  isActive && 'bg-primary-soft',
                )}
              >
                <tab.icon className="size-5" />
              </span>
              {t(`tabs.${tab.label}`)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient font-semibold text-on-brand',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Content column of a page. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto flex w-full max-w-3xl flex-col px-4 py-4 md:py-8', className)}>
      {children}
    </div>
  );
}

/** Full-height column for screens with a sticky top bar and bottom actions. */
export function FocusPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4', className)}>
      {children}
    </div>
  );
}

/** Title block of a tab screen. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
