import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';

import { createLogger } from './logger';

const logger = createLogger('firebase');

// Firebase web config is public by design (it ships in every bundle); access is guarded by
// Security Rules and API key restrictions in the Firebase console, not by hiding these values.
const firebaseConfig = {
  apiKey: 'AIzaSyB0hmsc6Jqsan8jOHGBvOLEzvJWzItizTA',
  authDomain: 'webqbank.firebaseapp.com',
  projectId: 'webqbank',
  storageBucket: 'webqbank.firebasestorage.app',
  messagingSenderId: '36944262662',
  appId: '1:36944262662:web:b566797b18324cd1e07587',
  measurementId: 'G-3Z8G0K2GGK',
};

export const firebaseApp = initializeApp(firebaseConfig);

/**
 * Analytics, or null where unsupported (blocked cookies/IndexedDB, some private windows) and in
 * dev, so local sessions don't pollute production data.
 */
export const analytics: Promise<Analytics | null> = import.meta.env.DEV
  ? Promise.resolve(null)
  : isSupported()
      .then((ok) => (ok ? getAnalytics(firebaseApp) : null))
      .catch((error: unknown) => {
        logger.warn('Firebase Analytics unavailable', error);
        return null;
      });
