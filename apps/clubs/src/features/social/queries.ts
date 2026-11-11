"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { useAccess } from "@/features/access";
import { toastError } from "@/features/plan";

import {
  announceCampaign,
  approvePost,
  cancelPost,
  createPost,
  deletePost,
  disconnectAccount,
  fetchAccounts,
  fetchDrafts,
  fetchEventPosts,
  fetchPendingChoices,
  fetchPlatforms,
  fetchPosters,
  fetchSettings,
  fetchShareKit,
  pickPendingChoice,
  previewPost,
  retryTarget,
  rewriteDraft,
  saveSettings,
  savePoster,
  schedulePost,
  startConnect,
  updatePost,
  uploadPoster,
  type PostBody,
} from "./api";
import { PLATFORM_LABEL, type Platform, type PosterSize, type SocialAccount } from "./schemas";

export const SOCIAL_KEY = ["social"] as const;
const PLATFORMS_KEY = [...SOCIAL_KEY, "platforms"] as const;
const ACCOUNTS_KEY = [...SOCIAL_KEY, "accounts"] as const;
const SETTINGS_KEY = [...SOCIAL_KEY, "settings"] as const;
const postsKey = (eventId: number) => [...SOCIAL_KEY, "event", eventId, "posts"] as const;
const draftsKey = (eventId: number, platforms: Platform[]) => [...SOCIAL_KEY, "event", eventId, "drafts", platforms.join(",")] as const;
const postersKey = (eventId: number) => [...SOCIAL_KEY, "event", eventId, "posters"] as const;
const shareKitKey = (eventId: number) => [...SOCIAL_KEY, "event", eventId, "share-kit"] as const;

/** How often an API without social posting is asked again, so the feature turns up once it is deployed. */
export const NOT_ON_SERVER_EVERY = 15 * 60_000;

/**
 * Who may do what (spec: "Who can do what"). Door staff see none of it.
 * Owners and admins connect, disconnect, approve and set the approval step;
 * editors draft, edit, schedule and see results. The server refusing is
 * what holds; these only keep out of sight what it would refuse.
 */
export interface SocialRole {
  /** Opens the feature at all: the Promote tab, the accounts page. */
  see: boolean;
  /** Connect, reconnect, disconnect; the approval setting; Approve. */
  manage: boolean;
  /** Draft, edit and schedule posts. */
  post: boolean;
  /** The server has said who is signed in (until then the dashboard assumes the owner). */
  known: boolean;
}

export function useSocialRole(): SocialRole {
  const access = useAccess();
  const see = Boolean(access.can.edit_events);
  const manage = see && (access.role === "owner" || access.role === "admin");
  return { see, manage, post: see, known: access.known };
}

/**
 * The platforms and why each can or can't be connected. `null`: an API from
 * before social posting -- asked again only now and then, so the feature
 * appears by itself the day the backend has it.
 */
export function useSocialPlatforms(enabled = true) {
  return useQuery({
    queryKey: PLATFORMS_KEY,
    queryFn: fetchPlatforms,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    refetchInterval: (q) => (q.state.data === null ? NOT_ON_SERVER_EVERY : false),
  });
}

/** True once the API is known to have social posting; false when known not to (or failing); undefined while asking. */
export function useSocialOnServer(enabled = true): boolean | undefined {
  const q = useSocialPlatforms(enabled);
  if (!enabled) return false;
  if (q.isError) return false;
  if (q.data === undefined) return undefined;
  return q.data !== null;
}

export function useSocialAccounts(enabled = true) {
  return useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts, enabled, staleTime: 30_000, retry: false });
}

export function useSocialSettings(enabled = true) {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchSettings, enabled, staleTime: 60_000, retry: false });
}

export function useSaveSocialSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (s) => {
      queryClient.setQueryData(SETTINGS_KEY, s);
      toast.success(s.approval_required ? "Editors' posts now wait for an owner or admin to approve them" : "Editors' posts go out without approval");
    },
    onError: toastError,
  });
}

/** Leaving the dashboard for a platform's sign-in (a seam, so tests can watch it without a navigation). */
export const browser = { go: (url: string) => window.location.assign(url) };

/** Sends the browser to the platform's sign-in; it comes back to `returnTo` with `?social=…`. */
export function useConnect() {
  return useMutation({
    mutationFn: async ({ platform, returnTo }: { platform: Platform; returnTo: string }) => {
      const { authorize_url } = await startConnect(platform, returnTo);
      browser.go(authorize_url);
      return authorize_url;
    },
    onError: toastError,
  });
}

function useRefreshAccounts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    // A held post moves once its account is back; a disconnect holds them.
    void queryClient.invalidateQueries({ queryKey: [...SOCIAL_KEY, "event"] });
  };
}

export function useDisconnect() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: (a: SocialAccount) => disconnectAccount(a.id),
    onSuccess: (_r, a) => {
      toast.success(`${PLATFORM_LABEL[a.platform]} disconnected. We deleted our access to it.`);
      refresh();
    },
    onError: toastError,
  });
}

export function usePendingChoices(stateId: string | null) {
  return useQuery({ queryKey: [...SOCIAL_KEY, "pending", stateId], queryFn: () => fetchPendingChoices(stateId!), enabled: Boolean(stateId), retry: false, staleTime: Infinity });
}

export function usePickPending() {
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: ({ stateId, externalId }: { stateId: string; externalId: string }) => pickPendingChoice(stateId, externalId),
    onSuccess: () => refresh(),
    onError: toastError,
  });
}

// ─── An event ────────────────────────────────────────────────────────────

/** The event's posts and the registrations each platform brought. Polled while something is on its way out. */
export function useEventPosts(eventId: number, enabled = true) {
  return useQuery({
    queryKey: postsKey(eventId),
    queryFn: () => fetchEventPosts(eventId),
    enabled: enabled && eventId > 0,
    staleTime: 10_000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.posts.some((p) => p.targets.some((t) => t.status === "posting")) ? 5_000 : false),
  });
}

/**
 * The server's rendering of one platform's text (fill-in words filled as
 * they would be now) and its warnings. Asked for the text the club stopped
 * typing at; the last answer stays while the next is on its way.
 */
export function usePreview(eventId: number, platform: Platform, text: string, variantId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...SOCIAL_KEY, "event", eventId, "preview", platform, variantId, text] as const,
    queryFn: () => previewPost(eventId, { platform, text, variant_id: variantId }),
    enabled: enabled && eventId > 0 && text.trim().length > 0,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useDrafts(eventId: number, platforms: Platform[], enabled = true) {
  return useQuery({
    queryKey: draftsKey(eventId, platforms),
    queryFn: () => fetchDrafts(eventId, platforms),
    enabled: enabled && eventId > 0 && platforms.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

export function usePosters(eventId: number, enabled = true) {
  return useQuery({ queryKey: postersKey(eventId), queryFn: () => fetchPosters(eventId), enabled: enabled && eventId > 0, staleTime: 60_000, retry: false });
}

export function useShareKit(eventId: number, enabled = true) {
  return useQuery({ queryKey: shareKitKey(eventId), queryFn: () => fetchShareKit(eventId), enabled: enabled && eventId > 0, staleTime: 60_000, retry: false });
}

function useRefreshEvent(eventId: number) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: postsKey(eventId) });
}

/** Saves the editor: a new post or a change to one, then schedules it when asked. */
export function useSavePost(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: async ({ postId, body, schedule }: { postId: number | null; body: PostBody; schedule: boolean }) => {
      if (postId === null) return createPost(eventId, { ...body, draft: !schedule });
      const saved = await updatePost(postId, body);
      if (!schedule || saved.status === "scheduled" || saved.status === "needs_approval") return saved;
      return (await schedulePost(postId)) ?? saved;
    },
    onSuccess: refresh,
  });
}

export function usePostAction(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: async ({ action, postId }: { action: "approve" | "cancel" | "delete" | "schedule"; postId: number }) => {
      if (action === "approve") return approvePost(postId);
      if (action === "cancel") return cancelPost(postId);
      if (action === "schedule") return schedulePost(postId);
      await deletePost(postId);
      return null;
    },
    onSuccess: (_r, { action }) => {
      toast.success(action === "approve" ? "Approved. It goes out at its time." : action === "cancel" ? "Cancelled. Nothing more goes out from this post." : action === "schedule" ? "Scheduled" : "Draft deleted");
      refresh();
    },
    onError: toastError,
  });
}

export function useRetryTarget(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: (targetId: number) => retryTarget(targetId),
    onSuccess: () => {
      toast.success("Trying again now");
      refresh();
    },
    onError: toastError,
  });
}

export function useAnnounce(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: (body: { platforms: Platform[]; account_ids: number[] }) => announceCampaign(eventId, body),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useRewrite(eventId: number) {
  return useMutation({ mutationFn: (body: { platform: Platform; text: string; tone?: string }) => rewriteDraft(eventId, body), onError: toastError });
}

export function useSavePoster(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ size, body, file }: { size: PosterSize; body?: { mode: "crop" | "fit"; focus?: { x: number; y: number }; background?: string }; file?: File }) =>
      file ? uploadPoster(eventId, size, file) : savePoster(eventId, size, body!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postersKey(eventId) });
      void queryClient.invalidateQueries({ queryKey: shareKitKey(eventId) });
    },
    onError: toastError,
  });
}
