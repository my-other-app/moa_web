import { z } from "zod";
import { imageFieldSchema } from "@moa/app-kit";

/** A follower, as `/clubs/followers/{id}` returns them. */
export const followerSchema = z.object({
  is_following: z.boolean().default(true),
  created_at: z.string().nullish(),
  user: z.object({
    id: z.coerce.number(),
    full_name: z.string().nullish(),
    username: z.string().nullish(),
    profile: z
      .object({
        full_name: z.string().nullish(),
        avatar: imageFieldSchema.nullish(),
      })
      .nullish(),
  }),
});

export const followerPageSchema = z.object({
  items: z.array(followerSchema).default([]),
  total: z.number().nullish(),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
});

export type Follower = z.infer<typeof followerSchema>;
export type FollowerPage = z.infer<typeof followerPageSchema>;

/**
 * Followers gained per day over the window, oldest first.
 *
 * Only over the followers actually loaded, so the caller decides whether that
 * is the whole set -- a trend drawn from one page would describe the page.
 */
export function followersPerDay(
  followers: readonly Follower[]
): Array<{ date: string; count: number }> {
  const byDay = new Map<string, number>();
  for (const follower of followers) {
    if (!follower.created_at) continue;
    const parsed = new Date(follower.created_at);
    if (Number.isNaN(parsed.getTime())) continue;
    const day = parsed.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}
