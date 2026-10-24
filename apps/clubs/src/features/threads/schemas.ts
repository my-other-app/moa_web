import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

export const pollOptionSchema = z.object({ id: z.string(), label: z.string(), votes: z.number(), share: z.number() });

export const threadSchema = z.object({
  id: z.string(),
  body: z.string(),
  image: imageFieldSchema,
  kind: z.enum(["post", "poll"]).catch("post"),
  poll: z.object({ options: z.array(pollOptionSchema), votes: z.number(), voted_option_id: z.string().nullable() }).nullable(),
  pinned: z.boolean(),
  notify_followers: z.boolean(),
  likes: z.number(),
  comments: z.number(),
  views: z.number(),
  liked: z.boolean().default(false),
  created_at: z.string(),
  // What the Threads page adds; absent from a payload cached before it existed.
  last_comment_at: z.string().nullish(),
  awaiting_reply: z.boolean().catch(false),
  engagement: z.number().catch(0),
});

export const threadPageSchema = z.object({
  items: z.array(threadSchema),
  total: z.number().default(0),
  limit: z.number().default(20),
  offset: z.number().default(0),
});

export const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.object({ id: z.number().nullable(), name: z.string(), is_club: z.boolean().default(false) }),
  created_at: z.string(),
});

export type Thread = z.infer<typeof threadSchema>;

export const MAX_BODY = 500;
export const MAX_POLL_OPTIONS = 4;

export const composeSchema = z
  .object({
    body: z.string().trim().min(1, "Write something first").max(MAX_BODY, `Keep it under ${MAX_BODY} characters`),
    notify_followers: z.boolean(),
    poll_options: z.array(z.string().trim().max(60, "Keep each option under 60 characters")),
  })
  .superRefine((v, ctx) => {
    const filled = v.poll_options.filter((o) => o.length > 0);
    if (v.poll_options.length > 0 && filled.length < 2) ctx.addIssue({ code: "custom", path: ["poll_options"], message: "A poll needs at least two options" });
    if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) ctx.addIssue({ code: "custom", path: ["poll_options"], message: "Two options say the same thing" });
  });
export type ComposeInput = z.infer<typeof composeSchema>;

// --- the Threads page ----------------------------------------------------------------------

export const THREAD_SCOPES = ["all", "awaiting", "pinned", "polls", "photos"] as const;
export type ThreadScope = (typeof THREAD_SCOPES)[number];
export const SCOPE_LABEL: Record<ThreadScope, string> = { all: "All posts", awaiting: "Awaiting a reply", pinned: "Pinned", polls: "Polls", photos: "With a photo" };
export const THREAD_SORTS = ["newest", "seen", "engaged"] as const;
export type ThreadSort = (typeof THREAD_SORTS)[number];
export const SORT_LABEL: Record<ThreadSort, string> = { newest: "Newest first", seen: "Most seen", engaged: "Most engaged" };

export const threadsPageSchema = z.object({ items: z.array(threadSchema), total: z.number(), limit: z.number(), offset: z.number(), counts: z.record(z.number()).default({}) });

export const threadInsightsSchema = z.object({
  posts: z.number(),
  posts_delta: z.number().nullish(),
  reach: z.number(),
  reach_delta: z.number().nullish(),
  reach_per_follower: z.number().nullish(),
  engagement_rate: z.number().nullish(),
  engagement_rate_prev: z.number().nullish(),
  awaiting: z.number(),
  best: z.object({ id: z.string(), body: z.string(), views: z.number(), engagement: z.number(), kind: z.string() }).nullish(),
  weeks: z.array(z.object({ week: z.string(), posts: z.number(), reach: z.number(), reactions: z.number() })),
  kinds: z.array(z.object({ kind: z.string(), label: z.string(), posts: z.number(), avg_reach: z.number().nullish(), avg_engagement: z.number().nullish() })),
  notify: z.object({ told: z.object({ posts: z.number(), avg_reach: z.number().nullish() }), quiet: z.object({ posts: z.number(), avg_reach: z.number().nullish() }) }),
  followers: z.number(),
  all_time: z.object({ posts: z.number(), reach: z.number(), engagement: z.number() }),
  generated_at: z.string(),
});
export type ThreadInsights = z.infer<typeof threadInsightsSchema>;
