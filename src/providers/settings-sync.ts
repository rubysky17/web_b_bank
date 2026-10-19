import i18n, { resolveLanguage } from '@/i18n';
import { type ThemePreference, useSettingsStore } from '@/stores/settings-store';

type Settings = Pick<ReturnType<typeof useSettingsStore.getState>, 'theme' | 'language'>;

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme: ThemePreference) {
  const isDark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

function apply({ theme, language }: Settings) {
  applyTheme(theme);
  const lang = resolveLanguage(language);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

/**
 * Pushes persisted settings into the document (the `dark` class) and i18next (language).
 * localStorage hydration is synchronous, so the first paint already uses the saved values.
 */
export function startSettingsSync() {
  apply(useSettingsStore.getState());
  darkQuery.addEventListener('change', () => applyTheme(useSettingsStore.getState().theme));
  return useSettingsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme || state.language !== prev.language) apply(state);
  });
}
