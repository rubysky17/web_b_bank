import { z } from 'zod';

const EnvSchema = z.object({
  /**
   * Base URL of the Q Bank API, including the `/api/v1` prefix. Always ends with `/`: ky resolves
   * `auth/login` against it like a browser would, so without the slash `/v1` would be replaced.
   */
  API_URL: z
    .url()
    .default('https://back-q-bank.vodat10998.workers.dev/api/v1')
    .transform((url) => (url.endsWith('/') ? url : `${url}/`)),
  /** Help & feedback in Settings opens a mail to this address; the row hides when empty. */
  SUPPORT_EMAIL: z.string().default(''),
});

/**
 * `npm run dev` without VITE_API_URL talks to the Vite dev server, which proxies `/api` and
 * `/media` to production (vite.config.ts): no CORS setup is needed to develop locally.
 */
const devProxyUrl =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1`
    : undefined;

// Vite inlines each import.meta.env.VITE_* at build time: reference them literally.
export const env = EnvSchema.parse({
  API_URL: import.meta.env.VITE_API_URL || devProxyUrl,
  SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL || undefined,
});

/** Origin of the API worker: question images (`/media/...`) and the privacy page live there. */
export const API_ORIGIN = new URL(env.API_URL).origin;
