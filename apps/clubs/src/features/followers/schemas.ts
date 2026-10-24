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

/** GET /clubs/followers/{club_id}/{user_id}: one follower, as far as the club may know them. */
export const followerProfileSchema = z.object({
  user: z.object({
    id: z.coerce.number(),
    full_name: z.string().nullish(),
    username: z.string().nullish(),
    avatar: z.any().nullish(),
    org: z.string().nullish(),
    interests: z.array(z.string()).default([]),
  }),
  followed_at: z.string().nullish(),
  contact: z.object({ email: z.string().nullish(), phone: z.string().nullish() }),
  events: z.array(
    z.object({
      event_id: z.coerce.number(),
      name: z.string(),
      starts_at: z.string().nullish(),
      status: z.string(),
      attended: z.boolean(),
      paid: z.boolean(),
      paid_amount: z.number(),
      registered_at: z.string().nullish(),
    })
  ),
  totals: z.object({ registrations: z.number(), attended: z.number(), paid: z.number() }),
});

// --- the followers page ----------------------------------------------------------------------

export const SEGMENTS = ["all", "new", "regulars", "once", "never", "quiet"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABEL: Record<Segment, string> = { all: "Everyone", new: "New", regulars: "Regulars", once: "Came once", never: "Never came", quiet: "Gone quiet" };
export const SEGMENT_HINT: Record<Segment, string> = {
  all: "Everyone who follows the club.",
  new: "Followed in the last 30 days.",
  regulars: "Came to two or more of your events.",
  once: "Came to one event.",
  never: "Never been to one — some are registered for the next.",
  quiet: "Nothing in 90 days and not in for anything ahead.",
};
export const SORTS = ["newest", "oldest", "active", "name"] as const;
export type FollowerSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<FollowerSort, string> = { newest: "Newest first", oldest: "Longest following", active: "Most active", name: "By name" };

export const followerRowSchema = z.object({
  user: z.object({ id: z.coerce.number(), full_name: z.string(), username: z.string().nullish(), avatar: z.any().nullish() }),
  org: z.string().nullish(),
  interests: z.array(z.string()).default([]),
  followed_at: z.string().nullish(),
  source: z.string().nullish(),
  registrations: z.number(),
  attended: z.number(),
  last_registered_at: z.string().nullish(),
  upcoming: z.number(),
  segments: z.array(z.string()).default([]),
});
export type FollowerRow = z.infer<typeof followerRowSchema>;

export const followersListSchema = z.object({ items: z.array(followerRowSchema), total: z.number(), limit: z.number(), offset: z.number(), counts: z.record(z.number()) });

const named = z.object({ name: z.string(), count: z.number() });
export const followersInsightsSchema = z.object({
  total: z.number(),
  new: z.number(),
  new_delta: z.number().nullish(),
  came: z.number(),
  regulars: z.number(),
  registered_ahead: z.number(),
  quiet: z.number(),
  next_event: z.object({ id: z.number(), name: z.string() }).nullish(),
  growth: z.array(z.object({ month: z.string(), joined: z.number(), total: z.number() })),
  by_org: z.array(named),
  interests: z.array(named),
  sources: z.array(named),
  segments: z.record(z.number()),
  generated_at: z.string(),
});
export type FollowersInsights = z.infer<typeof followersInsightsSchema>;
