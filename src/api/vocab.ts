import { z } from 'zod';

import type { VocabChange, VocabCursor, VocabSyncResult } from '@/vocab/merge';

import { api } from './client';

const VocabCursorSchema = z.object({ rev: z.number(), key: z.string() });

export const VocabItemSchema = z.object({
  key: z.string(),
  term: z.string(),
  kind: z.string(),
  meaning: z.string().nullable(),
  partOfSpeech: z.string().nullable(),
  explanation: z.string().nullable(),
  context: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  deleted: z.boolean(),
  translateFailed: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** Body of POST /vocab/sync. */
export const VocabSyncResponseSchema = z.object({
  items: z.array(VocabItemSchema),
  cursor: VocabCursorSchema.nullable(),
  hasMore: z.boolean(),
  /** Notes still waiting for a translation. */
  pending: z.number(),
  maxRev: z.number(),
  /** No translation engine answered (rate limit, outage): stop waiting until the next sync. */
  translateUnavailable: z.boolean(),
  rejected: z.array(z.object({ key: z.string(), code: z.string(), newKey: z.string().nullish() })),
}) satisfies z.ZodType<VocabSyncResult>;

/**
 * Uploads local changes and pulls what changed since `cursor`. The server may translate up to five
 * notes meanwhile (free Google/Microsoft endpoints, tried in turn), hence the longer timeout.
 */
export function postVocabSync(body: { cursor: VocabCursor | null; changes: VocabChange[] }) {
  return api.post('vocab/sync', { json: body, timeout: 30_000 }).json(VocabSyncResponseSchema);
}
