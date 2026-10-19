import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'vi' | 'en';

/** Questions to answer per day; null = no goal. */
export const DAILY_GOALS = [10, 20, 30, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number] | null;

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

const initialState = {
  theme: 'system',
  language: 'system',
  dailyGoal: null,
} satisfies SettingsData;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setDailyGoal: (dailyGoal) => set({ dailyGoal }),
      reset: () => set(initialState),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ theme, language, dailyGoal }) => ({ theme, language, dailyGoal }),
      migrate: (persisted) => ({ ...initialState, ...(persisted as Partial<SettingsData>) }),
    },
  ),
);
