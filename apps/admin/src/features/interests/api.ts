import { z } from "zod";
import { api, parseTopicTree, topicStatsSchema, type Topic, type TopicInterest, type TopicStats } from "@moa/app-kit";

import { isMissingEndpoint, type InterestFormInput, type ReorderBody, type TopicFormInput } from "./schemas";

/*
 * Every call here is typed by hand from the topics contract; see schemas.ts
 * for the list and why it is not generated.
 */

/** GET /interests/list: every topic and its interests, in order. */
export async function fetchTopicTree(): Promise<Topic[]> {
  return parseTopicTree(await api.get<unknown>("/api/v1/interests/list"));
}

/**
 * GET /interests/topics: each topic's clubs and upcoming events, and each
 * interest's upcoming events. Null from a server before the topics release
 * (it answers 405), so the page shows the tree without numbers.
 */
export async function fetchTopicStats(): Promise<TopicStats[] | null> {
  try {
    return z.array(topicStatsSchema).parse(await api.get<unknown>("/api/v1/interests/topics"));
  } catch (error) {
    if (isMissingEndpoint(error)) return null;
    throw error;
  }
}

/** An emoji is sent as one; nothing is sent as null for both, never "" (the seeded rows' "string" problem). */
function iconFields(icon: string | undefined) {
  const trimmed = icon?.trim();
  return { icon: trimmed || null, icon_type: trimmed ? "emoji" : null };
}

/** Optional text: left out when empty, so the server derives a slug or keeps no colour. */
const optional = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/**
 * POST /interests/category/create. The server before the topics release
 * reads name and icon and ignores the rest, so the same body works on both.
 */
export async function createTopic(input: TopicFormInput): Promise<void> {
  await api.post<unknown>("/api/v1/interests/category/create", {
    name: input.name.trim(),
    slug: optional(input.slug),
    ...iconFields(input.icon),
    color: optional(input.color),
    description: optional(input.description),
  });
}

/** PUT /interests/category/{id}. A colour or description emptied is sent as null so it can be cleared. */
export async function updateTopic(topicId: number, input: TopicFormInput): Promise<void> {
  await api.put<unknown>(`/api/v1/interests/category/${topicId}`, {
    name: input.name.trim(),
    slug: optional(input.slug),
    ...iconFields(input.icon),
    color: optional(input.color) ?? null,
    description: optional(input.description) ?? null,
  });
}

/**
 * DELETE /interests/category/{id}?move_to={id}: its interests move to
 * `moveTo` first, so no club, event or person loses one. Without `moveTo`
 * a topic with interests is refused (409 TOPIC_NOT_EMPTY); `moveTo` equal
 * to itself is a 400.
 */
export async function deleteTopic(topicId: number, moveTo?: number): Promise<unknown> {
  return api.del<unknown>(`/api/v1/interests/category/${topicId}`, undefined, moveTo != null ? { query: { move_to: moveTo } } : undefined);
}

/** POST /interests/reorder: the topics in order, and/or a topic's interests in order. */
export async function reorder(body: ReorderBody): Promise<void> {
  await api.post<unknown>("/api/v1/interests/reorder", body);
}

export async function createInterest(input: InterestFormInput): Promise<void> {
  await api.post<void>("/api/v1/interests/create", {
    name: input.name.trim(),
    category_id: input.category_id,
    // The checker only renders an icon it recognises as an emoji, so an
    // empty one is sent as null rather than "".
    ...iconFields(input.icon),
    slug: optional(input.slug),
  });
}

/** PUT /interests/{id}. The topic goes every time, which is also how an interest moves. */
export async function updateInterest(interestId: number, input: InterestFormInput): Promise<void> {
  await api.put<void>(`/api/v1/interests/${interestId}`, {
    name: input.name.trim(),
    category_id: input.category_id,
    ...iconFields(input.icon),
    slug: optional(input.slug),
  });
}

/**
 * An interest moved under another topic, everything else as it was. The
 * handler assigns what it is sent, so the name and icon go with it.
 */
export async function moveInterest(interest: TopicInterest, toTopicId: number): Promise<void> {
  await api.put<void>(`/api/v1/interests/${interest.id}`, {
    name: interest.name,
    category_id: toTopicId,
    icon: interest.icon ?? null,
    icon_type: interest.icon_type ?? null,
    slug: interest.slug ?? undefined,
  });
}

/** Detaches it from every club, event and user that selected it. */
export async function deleteInterest(interestId: number): Promise<{ detached_from: number }> {
  return api.del<{ detached_from: number }>(`/api/v1/interests/${interestId}`);
}
