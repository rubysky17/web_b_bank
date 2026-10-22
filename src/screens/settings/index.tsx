import {
  BookA,
  ChevronRight,
  CloudCheck,
  CloudUpload,
  Flag,
  GraduationCap,
  Info,
  Lock,
  LogOut,
  type LucideIcon,
  Mail,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { pendingUploadCount, syncAllAttemptsNow } from '@/api/attempt-sync';
import { useAttempts } from '@/api/attempts';
import { useLogout, useLogoutAll, useMe } from '@/api/auth';
import { describeError } from '@/api/errors';
import { flushLegacyOutbox, pendingLegacyCount } from '@/api/legacy-outbox';
import { useReportExams } from '@/api/reports';
import { syncUserStateNow } from '@/api/user-state-sync';
import { syncVocab } from '@/api/vocab-sync';
import { BrandCard } from '@/components/app/brand';
import { confirm } from '@/components/app/confirm';
import { IconTile, type Tone } from '@/components/app/icon-tile';
import { SegmentedControl } from '@/components/app/segmented-control';
import { TopBar } from '@/components/app/top-bar';
import { Page, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { API_ORIGIN, env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { useLocalAttempts } from '@/stores/attempt-sessions';
import {
  DAILY_GOALS,
  type LanguagePreference,
  type ThemePreference,
  useSettingsStore,
} from '@/stores/settings-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { usePendingUserStateCount } from '@/stores/user-state-store';
import { usePendingVocabCount } from '@/stores/vocab-store';
import { countByDay, currentStreak } from '@/utils/activity';

const THEMES = ['system', 'light', 'dark'] as const satisfies readonly ThemePreference[];
const LANGUAGES = ['system', 'vi', 'en'] as const satisfies readonly LanguagePreference[];

/** Served by the API worker (back_q_bank/public/privacy.html). */
const PRIVACY_URL = `${API_ORIGIN}/privacy`;

export function SettingsScreen() {
  const { t } = useTranslation();
  // One selector per value: this screen re-renders only when these fields change.
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const setDailyGoal = useSettingsStore((s) => s.setDailyGoal);
  const { data: me } = useMe();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { mutate: logoutAll, isPending: isLoggingOutAll, error: logoutAllError } = useLogoutAll();

  const confirmLogoutAll = async () => {
    const ok = await confirm({
      title: t('settings.logoutAllTitle'),
      message: t('settings.logoutAllMessage'),
      confirmLabel: t('settings.logoutAll'),
      destructive: true,
    });
    if (ok) logoutAll();
  };

  return (
    <Page className="gap-5 pt-0 pb-10 md:pt-8">
      {/* Not a tab: phones get a back button instead of the tab bar; the sidebar stays from md. */}
      <TopBar title={t('settings.title')} fallback="/" className="md:hidden" />
      <div className="hidden md:block">
        <PageTitle title={t('settings.title')} />
      </div>
      <AccountCard />

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsGroup title={t('settings.account')}>
          <SettingsRow
            icon={UserRound}
            tone="blue"
            title={t('settings.editProfile')}
            detail={me?.fullName}
            to="/profile"
            hasDivider
          />
          <SettingsRow
            icon={Lock}
            tone="violet"
            title={t('settings.changePassword')}
            detail={t('settings.changePasswordHint')}
            to="/change-password"
          />
        </SettingsGroup>

        <div className="flex flex-col gap-5">
          <Section title={t('settings.appearance')}>
            <SegmentedControl
              value={theme}
              onValueChange={setTheme}
              options={THEMES.map((value) => ({ value, label: t(`settings.theme.${value}`) }))}
            />
          </Section>
          <Section title={t('settings.language.label')}>
            <SegmentedControl
              value={language}
              onValueChange={setLanguage}
              options={LANGUAGES.map((value) => ({
                value,
                label: t(`settings.language.${value}`),
              }))}
            />
          </Section>
        </div>

        <SettingsGroup title={t('settings.study')}>
          <SettingsRow
            icon={Flag}
            tone="orange"
            title={t('settings.dailyGoal')}
            detail={
              dailyGoal === null
                ? t('settings.dailyGoalOff')
                : t('settings.dailyGoalOn', { count: dailyGoal })
            }
          >
            <ChoiceChips
              value={dailyGoal}
              onChange={setDailyGoal}
              options={[
                { value: null, label: t('settings.goalOff') },
                ...DAILY_GOALS.map((goal) => ({ value: goal, label: String(goal) })),
              ]}
            />
          </SettingsRow>
        </SettingsGroup>

        <SyncGroup />

        <SettingsGroup title={t('settings.security')}>
          <SettingsRow
            icon={Smartphone}
            tone="orange"
            title={t('settings.logoutAll')}
            detail={logoutAllError ? describeError(logoutAllError, t) : t('settings.logoutAllHint')}
            accessory={isLoggingOutAll ? <Spinner /> : undefined}
            onPress={() => void confirmLogoutAll()}
            hasDivider
          />
          <SettingsRow
            icon={Trash2}
            tone="pink"
            title={t('settings.deleteAccount')}
            detail={t('settings.deleteAccountHint')}
            to="/delete-account"
            isDanger
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.about')}>
          {env.SUPPORT_EMAIL ? (
            <SettingsRow
              icon={Mail}
              tone="amber"
              title={t('settings.help')}
              detail={env.SUPPORT_EMAIL}
              href={`mailto:${env.SUPPORT_EMAIL}?subject=${encodeURIComponent(t('settings.helpSubject'))}`}
              hasDivider
            />
          ) : null}
          <SettingsRow
            icon={ShieldCheck}
            tone="blue"
            title={t('settings.privacy')}
            href={PRIVACY_URL}
            hasDivider
          />
          <SettingsRow
            icon={Info}
            tone="violet"
            title={t('settings.version', { version: __APP_VERSION__ })}
            detail="Q Bank · Web"
          />
        </SettingsGroup>
      </div>

      <Button
        variant="destructive-soft"
        size="lg"
        onClick={() => logout()}
        disabled={isLoggingOut}
        className="lg:self-start"
      >
        <LogOut />
        {t('settings.signOut')}
      </Button>
    </Page>
  );
}

/** Profile on the brand gradient, with finished attempts, average % correct and day streak. */
function AccountCard() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { data: reportExams } = useReportExams();
  const { data: attempts } = useAttempts();
  const finished = reportExams?.reduce((sum, exam) => sum + exam.attemptCount, 0) ?? null;
  const avgCorrect =
    reportExams && finished
      ? Math.round(
          reportExams.reduce((sum, exam) => sum + exam.avgCorrectPercent * exam.attemptCount, 0) /
            finished,
        )
      : null;
  const streak = attempts
    ? currentStreak(countByDay(attempts.map((a) => a.startedAt)), new Date())
    : null;

  return (
    <BrandCard className="text-on-brand">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-4 border-on-brand-track bg-on-brand text-2xl font-bold text-brand-end">
          {me?.fullName.charAt(0).toUpperCase() ?? ''}
        </div>
        {me ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{me.fullName}</p>
            <p className="truncate text-sm text-on-brand-muted">{me.email}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32 rounded-full bg-on-brand-subtle" />
            <Skeleton className="h-3 w-48 rounded-full bg-on-brand-subtle" />
          </div>
        )}
        {me ? (
          <span className="rounded-full bg-on-brand-subtle px-2.5 py-1 text-xs font-semibold">
            {t(`settings.role.${me.role}`)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={finished === null ? '—' : String(finished)} label={t('settings.statAttempts')} />
        <Stat value={avgCorrect === null ? '—' : `${avgCorrect}%`} label={t('settings.statAvg')} />
        <Stat
          value={streak === null ? '—' : String(streak)}
          label={t('settings.statStreak', { count: streak ?? 0 })}
        />
      </div>
    </BrandCard>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-on-brand-subtle px-2 py-2.5">
      <span className="text-lg font-semibold">{value}</span>
      <span className="truncate text-xs text-on-brand-muted">{label}</span>
    </div>
  );
}

/**
 * Sectioned attempts and vocabulary notes kept in this browser: what still has to reach the
 * server, and "sync now".
 */
function SyncGroup() {
  const { t, i18n } = useTranslation();
  // Re-renders after each upload (the device index changes).
  useLocalAttempts();
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'offline'>('idle');
  const pending = pendingUploadCount() + pendingLegacyCount();
  const vocabPending = usePendingVocabCount();
  const userStatePending = usePendingUserStateCount();

  const syncNow = async () => {
    setState('running');
    const [outcomes, legacy] = await Promise.all([
      syncAllAttemptsNow(),
      flushLegacyOutbox(),
      syncVocab(),
      syncUserStateNow(),
    ]);
    setState([...outcomes, ...legacy].includes('OFFLINE') ? 'offline' : 'done');
  };

  const last =
    lastSyncedAt === null
      ? t('settings.neverSynced')
      : t('settings.lastSynced', {
          time: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(lastSyncedAt)),
        });

  return (
    <SettingsGroup title={t('settings.sync')}>
      <SettingsRow
        icon={pending > 0 ? CloudUpload : CloudCheck}
        tone={pending > 0 ? 'amber' : 'violet'}
        title={pending > 0 ? t('settings.pendingSync', { count: pending }) : t('settings.allSynced')}
        detail={
          state === 'offline'
            ? t('settings.syncOffline')
            : state === 'done'
              ? t('settings.syncDone')
              : last
        }
        accessory={
          state === 'running' ? (
            <Spinner />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void syncNow()}>
              {t('settings.syncNow')}
            </Button>
          )
        }
        hasDivider={vocabPending > 0 || userStatePending > 0}
      />
      {vocabPending > 0 ? (
        <SettingsRow
          icon={BookA}
          tone="amber"
          title={t('settings.vocabPending', { count: vocabPending })}
          to="/vocab"
          hasDivider={userStatePending > 0}
        />
      ) : null}
      {userStatePending > 0 ? (
        <SettingsRow
          icon={GraduationCap}
          tone="amber"
          title={t('settings.practicePending', { count: userStatePending })}
        />
      ) : null}
    </SettingsGroup>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  );
}

/** Uppercase label over a bordered card of rows (Figma v2 Settings). */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <div className="overflow-hidden rounded-3xl border bg-card">{children}</div>
    </Section>
  );
}

type SettingsRowProps = {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail?: string | null;
  /** Right side: a button, a spinner… A chevron is shown for links and buttons without one. */
  accessory?: ReactNode;
  /** In-app route. */
  to?: string;
  /** External link (opens in a new tab, except mailto:). */
  href?: string;
  onPress?: () => void;
  /** Red title (destructive actions). */
  isDanger?: boolean;
  /** Draws the hairline under the row (every row but the last). */
  hasDivider?: boolean;
  /** Extra content under the title row (chips). */
  children?: ReactNode;
};

function SettingsRow({
  icon,
  tone,
  title,
  detail,
  accessory,
  to,
  href,
  onPress,
  isDanger = false,
  hasDivider = false,
  children,
}: SettingsRowProps) {
  const isInteractive = to !== undefined || href !== undefined || onPress !== undefined;
  const body = (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <IconTile tone={tone} icon={icon} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-2 text-sm font-semibold', isDanger && 'text-destructive')}>
            {title}
          </p>
          {detail ? <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        {accessory ??
          (isInteractive ? <ChevronRight className="size-[18px] text-muted-foreground" /> : null)}
      </div>
      {children}
    </div>
  );
  const className = cn('block w-full text-left', hasDivider && 'border-b', isInteractive && 'transition hover:bg-accent');

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  if (href) {
    const external = !href.startsWith('mailto:');
    return (
      <a
        href={href}
        className={className}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {body}
      </a>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/** Small single-choice chips under a row (goal sizes). */
function ChoiceChips<T>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pl-12" role="radiogroup">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition',
              isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
