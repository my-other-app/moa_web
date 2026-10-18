import type { LinkedInterest, Topic, TopicInterest, TopicRef } from "./schemas";

/**
 * Whether the list came from a server that knows about topics.
 *
 * The topics release adds slug, color and sort_order to every topic; the
 * server in production before it sends none. Before it, every interest sits
 * under one category ("arts"), so a topic derived from that list would label
 * a hackathon "arts" -- better to show no topic than a wrong one.
 */
export function isTopicAware(tree: readonly Topic[] | undefined | null): boolean {
  return !!tree?.some((t) => t.slug != null || t.color != null || t.sort_order != null);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The topic's colour when it has a usable one; otherwise the brand's, so the dot still reads. */
export function topicColor(topic: { color?: string | null | undefined }): string {
  return topic.color && HEX.test(topic.color.trim()) ? topic.color.trim() : "var(--brand)";
}

/** "arts" (the name the old seed gave it) reads as "Arts"; a name with capitals is left as written. */
export function topicLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed === trimmed.toLowerCase() ? trimmed.replace(/^\p{L}/u, (c) => c.toUpperCase()) : trimmed;
}

/**
 * Interest icons are stored as free text with an `icon_type`, and the seeded
 * rows contain the literal word "string". Rendering that verbatim puts
 * "string Coding" on the chip, so only a value that is actually outside ASCII
 * -- a real emoji -- is shown.
 */
export function interestEmoji(item: { icon?: string | null | undefined; icon_type?: string | null | undefined }): string | null {
  if (!item.icon || item.icon_type !== "emoji") return null;
  return /[^\u0000-\u007F]/.test(item.icon) ? item.icon : null;
}

/** Every interest in the tree by id, with the topic it sits under. */
export function interestIndex(tree: readonly Topic[]): Map<number, { interest: TopicInterest; topic: Topic }> {
  const index = new Map<number, { interest: TopicInterest; topic: Topic }>();
  for (const topic of tree) for (const interest of topic.interests) index.set(interest.id, { interest, topic });
  return index;
}

export function toTopicRef(topic: Topic): TopicRef {
  return { id: topic.id, name: topic.name, slug: topic.slug ?? null, color: topic.color ?? null };
}

/**
 * The distinct topics a set of interests falls under, in the tree's order.
 *
 * An interest's own `category_id` wins when the payload carries it; an id
 * the tree knows is placed by the tree; anything else is skipped.
 */
export function topicsForInterests(
  interests: ReadonlyArray<number | Pick<LinkedInterest, "id" | "category_id">>,
  tree: readonly Topic[],
): TopicRef[] {
  const index = interestIndex(tree);
  const wanted = new Set<number>();
  for (const item of interests) {
    const id = typeof item === "number" ? item : item.id;
    const categoryId = typeof item === "number" ? null : (item.category_id ?? null);
    const topicId = categoryId ?? index.get(id)?.topic.id;
    if (topicId != null) wanted.add(topicId);
  }
  return tree.filter((t) => wanted.has(t.id)).map(toTopicRef);
}

/**
 * The topics to show for an event or a club.
 *
 * The server's own `topics` when it sent them (an empty list included: it
 * has said there are none); otherwise worked out from its interests against
 * the cached /interests/list, but only once that list knows about topics;
 * otherwise none.
 */
export function resolveTopics(
  entity: { topics?: readonly TopicRef[] | null | undefined; interests?: ReadonlyArray<Pick<LinkedInterest, "id" | "category_id">> | null | undefined },
  tree: readonly Topic[] | undefined | null,
): TopicRef[] {
  if (Array.isArray(entity.topics)) return [...entity.topics];
  if (!entity.interests?.length || !tree || !isTopicAware(tree)) return [];
  return topicsForInterests(entity.interests, tree);
}

/** Lowercased, accents stripped, spaces collapsed: what a search compares. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The tree narrowed to what a search matches: a topic whose name matches
 * keeps all its interests; otherwise only the interests that match, and a
 * topic left with none is dropped.
 */
export function filterTopicTree(tree: readonly Topic[], query: string): Topic[] {
  const q = searchKey(query);
  if (!q) return [...tree];
  const out: Topic[] = [];
  for (const topic of tree) {
    if (searchKey(topic.name).includes(q)) {
      out.push(topic);
      continue;
    }
    const interests = topic.interests.filter((i) => searchKey(i.name).includes(q) || (i.slug ? searchKey(i.slug.replace(/-/g, " ")).includes(q) : false));
    if (interests.length) out.push({ ...topic, interests });
  }
  return out;
}
