import { z } from "zod";
import { ApiError } from "@moa/api";
import type { Topic, TopicInterest } from "@moa/app-kit";

/*
 * Topics (the main categories: Development, Deep Tech, Arts…) and the
 * interests under them. The list and the topic shape are shared with the
 * clubs dashboard (@moa/app-kit); what is here is the admin's: the forms,
 * the reorder payload and the refusals.
 *
 * The endpoints below are typed by hand from the topics contract
 * (2026-10-18) rather than generated: the backend that serves them is not
 * deployed yet, and @moa/api's generated schema is regenerated from a live
 * backend, not ahead of one.
 *
 *   GET    /interests/list                    the tree (shape unchanged, new fields)
 *   GET    /interests/topics                  topics with live counts
 *   POST   /interests/category/create         + slug?, color?, description?, sort_order?
 *   PUT    /interests/category/{id}           { name, slug?, icon?, icon_type?, color?, description? }
 *   DELETE /interests/category/{id}?move_to=  409 TOPIC_NOT_EMPTY without move_to when it has interests
 *   POST   /interests/reorder                 { topics?: [ids], interests?: { "<topic id>": [ids] } }
 *   POST   /interests/create, PUT /interests/{id}   + slug?, sort_order?
 */

export type { Topic, TopicInterest };

/** The error codes the topic endpoints answer with. */
export const TOPIC_ERRORS = {
  notEmpty: "TOPIC_NOT_EMPTY",
  notFound: "TOPIC_NOT_FOUND",
} as const;

/**
 * The endpoint itself is not there: the server in production before the
 * topics release. FastAPI answers a path it has no route for with a bare
 * 404 "Not Found", and a path it has for other methods only (GET
 * /interests/topics against PUT /interests/{id}) with a 405. A 404 the new
 * server raises on purpose carries an error code, so it is not this.
 */
export function isMissingEndpoint(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 405) return true;
  return error.status === 404 && !error.errorCode && /^not found\.?$/i.test(error.message.trim());
}

export function isTopicNotEmpty(error: unknown): boolean {
  return error instanceof ApiError && (error.errorCode === TOPIC_ERRORS.notEmpty || (error.status === 409 && !error.errorCode));
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Gaming & Media" → "gaming-media", the way the server derives one when none is given. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** The seeded topics' colours, offered first; any other hex can be typed. */
export const TOPIC_COLORS = ["#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#059669", "#DC2626", "#0D9488", "#CA8A04"] as const;

const slugField = z
  .string()
  .trim()
  .max(60, "Keep the address under 60 characters")
  .refine((v) => v === "" || SLUG_RE.test(v), "Lowercase letters, numbers and single dashes, like deep-tech")
  .optional();

const emojiField = z.string().trim().max(10, "One emoji is enough").optional();

export const topicFormSchema = z.object({
  name: z.string().trim().min(2, "Give it a name of at least 2 characters").max(50, "Keep the name under 50 characters"),
  slug: slugField,
  icon: emojiField,
  color: z
    .string()
    .trim()
    .refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Use a 6-digit hex colour, like #2563EB")
    .optional(),
  description: z.string().trim().max(200, "Keep the description under 200 characters").optional(),
});
export type TopicFormInput = z.infer<typeof topicFormSchema>;

export const interestFormSchema = z.object({
  name: z.string().trim().min(2, "Give it a name of at least 2 characters").max(50, "Keep the name under 50 characters"),
  category_id: z.number().int(),
  icon: emojiField,
  slug: slugField,
});
export type InterestFormInput = z.infer<typeof interestFormSchema>;

/** POST /interests/reorder: either part may be left out. */
export interface ReorderBody {
  topics?: number[];
  interests?: Record<string, number[]>;
}

/** The list with one item moved by `delta` places; the same list when it cannot move. */
export function moveBy<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Topic `topicId` moved one place up or down: the new tree and the body that says so. */
export function reorderTopic(tree: readonly Topic[], topicId: number, delta: -1 | 1): { next: Topic[]; body: ReorderBody } {
  const next = moveBy(tree, tree.findIndex((t) => t.id === topicId), delta);
  return { next, body: { topics: next.map((t) => t.id) } };
}

/** Interest `interestId` moved one place within its topic. */
export function reorderInterest(tree: readonly Topic[], topicId: number, interestId: number, delta: -1 | 1): { next: Topic[]; body: ReorderBody } {
  let ids: number[] = [];
  const next = tree.map((t) => {
    if (t.id !== topicId) return t;
    const interests = moveBy(t.interests, t.interests.findIndex((i) => i.id === interestId), delta);
    ids = interests.map((i) => i.id);
    return { ...t, interests };
  });
  return { next, body: { interests: { [String(topicId)]: ids } } };
}

/** The emoji an admin typed, or nothing: seeded rows hold the literal word "string". */
export function editableEmoji(icon: string | null | undefined): string {
  return icon && /[^\u0000-\u007F]/.test(icon) ? icon : "";
}
