import {
  ACCOUNT_SETTINGS,
  type AccountSetting,
  initialSettings,
  useSettingsStore,
} from '@/stores/settings-store';
import { storage } from '@/stores/storage';
import { liveItem, seedUserItem, useUserStateStore } from '@/stores/user-state-store';

/** Set once the settings chosen before they were synced have been given to a user. */
const ADOPTED_KEY = 'settings:adopted';

type AccountValues = Pick<ReturnType<typeof useSettingsStore.getState>, AccountSetting>;

/** The signed-in user's account settings: their synced values, else the defaults. */
function accountValues(): AccountValues {
  const state = useUserStateStore.getState();
  const value = <K extends AccountSetting>(key: K) =>
    (liveItem(state, 'SETTING', key)?.value ?? initialSettings[key]) as AccountValues[K];
  return { language: value('language'), dailyGoal: value('dailyGoal') };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Brings the account settings of the signed-in user into the settings store. */
function apply() {
  const next = accountValues();
  const current = useSettingsStore.getState();
  // Not through the setters: they would upload the values back.
  if (ACCOUNT_SETTINGS.some((key) => !same(current[key], next[key]))) {
    useSettingsStore.setState(next);
  }
}

/**
 * Keeps the settings screen on the signed-in user's account settings: when they sign in, and when
 * another device changes one. The first user to sign in after the update keeps (and uploads) the
 * settings chosen in this browser before they were synced. Started once by the app providers.
 */
export function startAccountSettingsSync() {
  return useUserStateStore.subscribe((state, previous) => {
    if (state.userId !== previous.userId) {
      if (!state.userId) return;
      if (storage.getString(ADOPTED_KEY) === undefined) {
        storage.set(ADOPTED_KEY, state.userId);
        const local = useSettingsStore.getState();
        for (const key of ACCOUNT_SETTINGS) {
          if (!same(local[key], initialSettings[key])) seedUserItem('SETTING', key, local[key]);
        }
      }
      apply();
      return;
    }
    if (state.userId && state.items !== previous.items) apply();
  });
}
