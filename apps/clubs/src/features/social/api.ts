import { api } from "@moa/app-kit";
import { ApiError } from "@moa/api";

import {
  accountsSchema,
  connectResponseSchema,
  draftsSchema,
  eventPostsSchema,
  pendingChoicesSchema,
  platformsSchema,
  postSchema,
  previewSchema,
  rewriteSchema,
  settingsSchema,
  shareKitSchema,
  variantSchema,
  variantsSchema,
  type Platform,
  type PosterSize,
  type Trigger,
} from "./schemas";

/** The club routes (contract: prefix `/api/v1/clubs/social`). */
export const SOCIAL_BASE = "/api/v1/clubs/social";
const eventBase = (eventId: number) => `${SOCIAL_BASE}/events/${eventId}`;

/**
 * Whether an error means "this API has no social posting yet": FastAPI's
 * bare 404 for a path nothing is mounted on, or a 405 (a route that exists
 * for another method). A coded 404 is the backend's own answer and not this.
 * On an API from before it, `/clubs/social/...` may also fall into a
 * `/clubs/{id}` route and fail its validation (a 422 with no code).
 */
export function isSocialMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return error.routeMissing || error.errorCode === null;
  if (error.status === 405) return true;
  return error.status === 422 && error.errorCode === null && !error.fieldErrors?.platform;
}

/**
 * GET /platforms: each platform, whether it can be connected, and why not.
 * `null` on an API without social posting: the whole feature then hides.
 */
export async function fetchPlatforms() {
  try {
    return platformsSchema.parse(await api.get<unknown>(`${SOCIAL_BASE}/platforms`));
  } catch (error) {
    if (isSocialMissing(error)) return null;
    throw error;
  }
}

export async function fetchAccounts() {
  return accountsSchema.parse(await api.get<unknown>(`${SOCIAL_BASE}/accounts`));
}

/** Starts a platform's sign-in: the server answers where to send the browser (with a signed, one-time state). */
export async function startConnect(platform: Platform, returnTo: string) {
  return connectResponseSchema.parse(await api.post<unknown>(`${SOCIAL_BASE}/accounts/${platform}/connect`, { return_to: returnTo }));
}

export async function disconnectAccount(id: string) {
  await api.del<unknown>(`${SOCIAL_BASE}/accounts/${id}`);
}

/** The Pages or Instagram accounts a sign-in came back with, to pick one. */
export async function fetchPendingChoices(stateId: string) {
  return pendingChoicesSchema.parse(await api.get<unknown>(`${SOCIAL_BASE}/accounts/pending/${encodeURIComponent(stateId)}`));
}

export async function pickPendingChoice(stateId: string, externalId: string) {
  return api.post<unknown>(`${SOCIAL_BASE}/accounts/pending/${encodeURIComponent(stateId)}`, { external_id: externalId });
}

export async function fetchSettings() {
  return settingsSchema.parse(await api.get<unknown>(`${SOCIAL_BASE}/settings`));
}

export async function saveSettings(body: { approval_required: boolean }) {
  return settingsSchema.parse(await api.put<unknown>(`${SOCIAL_BASE}/settings`, body));
}

// ─── An event's posts ────────────────────────────────────────────────────

export async function fetchEventPosts(eventId: number) {
  return eventPostsSchema.parse(await api.get<unknown>(`${eventBase(eventId)}/posts`));
}

export async function fetchDrafts(eventId: number, platforms: Platform[]) {
  return draftsSchema.parse(await api.get<unknown>(`${eventBase(eventId)}/drafts`, { query: { platforms: platforms.join(",") } }));
}

export interface TargetBody {
  platform: Platform;
  account_id: string;
  text: string;
  variant_id?: string;
  image_key?: string;
}

export interface PostBody {
  name: string;
  trigger: Trigger;
  targets: TargetBody[];
}

/** A post made whole: `draft` keeps it a draft, otherwise it is scheduled (or waits for approval). */
export async function createPost(eventId: number, body: PostBody & { draft: boolean }) {
  return postSchema.parse(await api.post<unknown>(`${eventBase(eventId)}/posts`, body));
}

export async function updatePost(postId: string, body: PostBody) {
  return postSchema.parse(await api.patch<unknown>(`${SOCIAL_BASE}/posts/${postId}`, body));
}

export async function schedulePost(postId: string) {
  return postSchema.safeParse(await api.post<unknown>(`${SOCIAL_BASE}/posts/${postId}/schedule`)).data ?? null;
}

export async function approvePost(postId: string) {
  return postSchema.safeParse(await api.post<unknown>(`${SOCIAL_BASE}/posts/${postId}/approve`)).data ?? null;
}

export async function cancelPost(postId: string) {
  return postSchema.safeParse(await api.post<unknown>(`${SOCIAL_BASE}/posts/${postId}/cancel`)).data ?? null;
}

export async function deletePost(postId: string) {
  await api.del<unknown>(`${SOCIAL_BASE}/posts/${postId}`);
}

export async function retryTarget(targetId: string) {
  return api.post<unknown>(`${SOCIAL_BASE}/targets/${targetId}/retry`);
}

/** The publish step's one click: the standard Announcement (on publish) and Reminder (2 days before) from the drafts. */
export async function announceCampaign(eventId: number, body: { platforms: Platform[]; account_ids: string[] }) {
  return api.post<unknown>(`${eventBase(eventId)}/posts/campaign`, body);
}

export async function previewPost(eventId: number, body: { platform: Platform; text: string; variant_id?: string | null }) {
  const { variant_id, ...rest } = body;
  return previewSchema.parse(await api.post<unknown>(`${eventBase(eventId)}/preview`, variant_id ? { ...rest, variant_id } : rest));
}

export async function rewriteDraft(eventId: number, body: { platform: Platform; text: string; tone?: string }) {
  return rewriteSchema.parse(await api.post<unknown>(`${eventBase(eventId)}/drafts/rewrite`, body));
}

// ─── Posters ─────────────────────────────────────────────────────────────

export async function fetchPosters(eventId: number) {
  return variantsSchema.parse(await api.get<unknown>(`${eventBase(eventId)}/posters`));
}

export async function savePoster(eventId: number, size: PosterSize, body: { mode: "crop" | "fit"; focus?: { x: number; y: number }; background?: string }) {
  return variantSchema.parse(await api.put<unknown>(`${eventBase(eventId)}/posters/${size}`, body));
}

/** The club's own image for one size, in place of the one made from the poster. */
export async function uploadPoster(eventId: number, size: PosterSize, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return variantSchema.parse(await api.put<unknown>(`${eventBase(eventId)}/posters/${size}`, fd));
}

// ─── Share kit ───────────────────────────────────────────────────────────

/** Ready-to-post text and poster per platform, on every plan. */
export async function fetchShareKit(eventId: number) {
  return shareKitSchema.parse(await api.get<unknown>(`/api/v1/social/share-kit/${eventId}`));
}
