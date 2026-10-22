import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';
import { setUserItem } from './user-state-store';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'vi' | 'en';

/** Questions to answer per day; null = no goal. */
export const DAILY_GOALS = [10, 20, 30, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number] | null;

/**
 * Settings kept per device (`theme`) and per account (the rest): account settings are also saved
 * as SETTING items of the signed-in user (`stores/user-state-store.ts`) and so follow them to every
 * device; `sync/account-settings.ts` brings the synced values back here. The persisted copy is what
 * the browser shows while signed out. (The phone app also syncs its study reminder.)
 */
export const ACCOUNT_SETTINGS = ['language', 'dailyGoal'] as const;
export type AccountSetting = (typeof ACCOUNT_SETTINGS)[number];

type SettingsData = {
  /** 'system' = follow the OS (prefers-color-scheme). */
  theme: ThemePreference;
  /** 'system' = follow the browser language (falls back to Vietnamese). */
  language: LanguagePreference;
  dailyGoal: DailyGoal;
};

type SettingsState = SettingsData & {
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setDailyGoal: (dailyGoal: DailyGoal) => void;
  reset: () => void;
};

export const initialSettings = {
  theme: 'system',
  language: 'system',
  dailyGoal: null,
} satisfies SettingsData;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialSettings,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => {
        set({ language });
        setUserItem('SETTING', 'language', language);
      },
      setDailyGoal: (dailyGoal) => {
        set({ dailyGoal });
        setUserItem('SETTING', 'dailyGoal', dailyGoal);
      },
      reset: () => set(initialSettings),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ theme, language, dailyGoal }) => ({
        theme,
        language,
        dailyGoal,
      }),
      migrate: (persisted) => ({
        ...initialSettings,
        ...(persisted as Partial<SettingsData>),
      }),
    },
  ),
);
