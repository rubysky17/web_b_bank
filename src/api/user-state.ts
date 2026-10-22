import { z } from 'zod';

import type { UserItemChange, UserStateCursor, UserStateSyncResult } from '@/user-state/merge';

import { api } from './client';

const CursorSchema = z.object({ rev: z.number(), kind: z.string(), key: z.string() });

/** Body of POST /me/sync. */
export const UserStateSyncResponseSchema = z.object({
  items: z.array(
    z.object({
      kind: z.string(),
      key: z.string(),
      value: z.unknown(),
      deleted: z.boolean(),
      updatedAt: z.number(),
    }),
  ),
  cursor: CursorSchema.nullable(),
  hasMore: z.boolean(),
  maxRev: z.number(),
  rejected: z.array(z.object({ kind: z.string(), key: z.string(), code: z.string() })),
}) satisfies z.ZodType<UserStateSyncResult>;

/** Uploads local changes (practice answers, settings) and pulls what changed since `cursor`. */
export function postUserStateSync(body: {
  cursor: UserStateCursor | null;
  changes: UserItemChange[];
}) {
  return api.post('me/sync', { json: body }).json(UserStateSyncResponseSchema);
}

/** Change markers of GET /me/sync-status: each grows when another device changed something. */
export const SyncStatusSchema = z.object({
  userStateRev: z.number(),
  vocabRev: z.number(),
  attemptsUpdatedAt: z.number(),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export function getSyncStatus() {
  return api.get('me/sync-status').json(SyncStatusSchema);
}
