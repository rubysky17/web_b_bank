import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { LanguagePreference } from '@/stores/settings-store';

import en from './locales/en.json';
import vi from './locales/vi.json';

export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const DEFAULT_LANGUAGE: Language = 'vi';

export const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

function isSupported(code: string | null | undefined): code is Language {
  return SUPPORTED_LANGUAGES.includes(code as Language);
}

/** Turns the user's preference ('system' | 'vi' | 'en') into the language actually shown. */
export function resolveLanguage(preference: LanguagePreference): Language {
  if (preference !== 'system') return preference;
  const browserLanguage = navigator.language.split('-')[0];
  return isSupported(browserLanguage) ? browserLanguage : DEFAULT_LANGUAGE;
}

const i18n = createInstance();

// Resources are bundled, so init completes synchronously before the first render.
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18n;
