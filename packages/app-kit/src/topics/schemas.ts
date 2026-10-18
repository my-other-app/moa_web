import { z } from "zod";

/**
 * Topics and interests, as both dashboards read them.
 *
 * A Topic is the main category (Development, Deep Tech, Arts…); an Interest
 * is one of its subcategories (Web Development, Robotics, Music…). People,
 * clubs and events link to interests; a topic is derived from them. The
 * event's *type* (Workshop, Talk…) is a different thing and is called Type.
 *
 * GET /interests/list keeps its old shape and gains fields: slug, color,
 * description and sort_order on a topic; slug, category_id and sort_order on
 * an interest. Every one of them is optional here, because the API in
 * production today sends none of them (one topic, "arts", holding all 27).
 */
export const topicInterestSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
  category_id: z.coerce.number().nullish(),
  sort_order: z.coerce.number().nullish(),
});
export type TopicInterest = z.infer<typeof topicInterestSchema>;

export const topicSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
  color: z.string().nullish(),
  description: z.string().nullish(),
  sort_order: z.coerce.number().nullish(),
  interests: z.array(topicInterestSchema).catch([]).default([]),
});
export type Topic = z.infer<typeof topicSchema>;

/** A topic as events and clubs carry it: `topics: [{ id, slug, name, color }]`. */
export const topicRefSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  color: z.string().nullish(),
});
export type TopicRef = z.infer<typeof topicRefSchema>;

/**
 * The `topics` key on an event or a club: the list when the server sent one,
 * null when it did not (an older server), so the caller knows to derive them.
 * A malformed list reads as absent rather than failing the whole payload.
 */
export const topicRefsField = z
  .array(topicRefSchema)
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

/** An interest inside an event or club payload: `category_id` arrives with the topics release. */
export const linkedInterestSchema = z.object({
  id: z.coerce.number(),
  name: z.string().nullish(),
  category_id: z.coerce.number().nullish(),
});
export type LinkedInterest = z.infer<typeof linkedInterestSchema>;

/** One topic with its live numbers, from GET /interests/topics. */
export const topicStatsSchema = z.object({
  id: z.coerce.number(),
  slug: z.string().nullish(),
  name: z.string(),
  upcoming_events: z.coerce.number().catch(0).default(0),
  clubs: z.coerce.number().catch(0).default(0),
  interests: z
    .array(
      z.object({
        id: z.coerce.number(),
        slug: z.string().nullish(),
        name: z.string(),
        upcoming_events: z.coerce.number().catch(0).default(0),
      }),
    )
    .catch([])
    .default([]),
});
export type TopicStats = z.infer<typeof topicStatsSchema>;

const looseInterestSchema = topicInterestSchema;

/**
 * GET /interests/list into topics, whatever shape it came in.
 *
 * Grouped (the real shape), a bare list of interests, or `{ items }` around
 * either: the event form once had to cope with all three, so the reader
 * still does. A bare list becomes one untitled group.
 */
export function parseTopicTree(raw: unknown): Topic[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!list) return z.array(topicSchema).parse(raw);
  const first = list[0] as Record<string, unknown> | undefined;
  if (!first || Array.isArray(first.interests)) return z.array(topicSchema).parse(list);
  const interests = z.array(looseInterestSchema).parse(list);
  return [{ id: 0, name: "Interests", interests }];
}
