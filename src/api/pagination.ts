import { z } from 'zod';

export const PAGE_SIZE = 20;

/** `{ items, total, page, limit }` — every list endpoint of the API. */
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  });

/** `getNextPageParam` for 1-based page numbers. */
export const nextPage = ({ page, limit, total }: { page: number; limit: number; total: number }) =>
  page * limit < total ? page + 1 : undefined;
