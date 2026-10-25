"use client";

import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ApiError, isRouteMissing, nullIfRouteMissing } from "@moa/api";

import {
  addNote,
  assignConversation,
  blockConversation,
  createSavedReply,
  createTemplate,
  deleteNote,
  deleteSavedReply,
  deleteTemplate,
  disconnectAccount,
  fetchAccount,
  fetchConversations,
  fetchInboxSettings,
  fetchMessages,
  fetchNotes,
  fetchOverview,
  fetchSavedReplies,
  fetchSummary,
  fetchTeam,
  fetchTemplates,
  installStandardTemplates,
  markRead,
  optInConversation,
  optOutConversation,
  saveAccount,
  sendMessage,
  setConversationStatus,
  unblockConversation,
  updateAccount,
  updateInboxSettings,
  updateMyNotifications,
  updateSavedReply,
  verifyAccount,
  type SavedReplyBody,
  type SendBody,
} from "./api";
import {
  ERROR_TEXT,
  INVALID_TEMPLATE,
  INVALID_WHATSAPP_KEYS,
  KEY_ERROR_FIELD,
  NO_WHATSAPP,
  PERMISSION_MESSAGE,
  PRIVATE_MESSAGE,
  TEMPLATE_NOT_APPROVED,
  UNAVAILABLE_MESSAGE,
  WHATSAPP_FAILED,
  WHATSAPP_PERMISSION,
  WHATSAPP_PRIVATE,
  WINDOW_CLOSED,
  type Account,
  type Conversation,
  type InboxSettings,
  type ConversationList,
  type InboxFilter,
  type Message,
  type MessageList,
  type KeyField,
  type Keys,
  type TemplateForm,
  type TemplateProblem,
} from "./schemas";
import type { RefreshPlan } from "./stream";

export const WA_KEY = ["whatsapp"] as const;
export const ACCOUNT_KEY = [...WA_KEY, "account"] as const;
export const OVERVIEW_KEY = [...WA_KEY, "overview"] as const;
export const CONVERSATIONS_KEY = [...WA_KEY, "conversations"] as const;
export const MESSAGES_KEY = [...WA_KEY, "messages"] as const;
export const TEMPLATES_KEY = [...WA_KEY, "templates"] as const;
export const SUMMARY_KEY = [...WA_KEY, "summary"] as const;
export const TEAM_KEY = [...WA_KEY, "team"] as const;
export const NOTES_KEY = [...WA_KEY, "notes"] as const;
export const SAVED_REPLIES_KEY = [...WA_KEY, "saved-replies"] as const;
export const INBOX_SETTINGS_KEY = [...WA_KEY, "inbox-settings"] as const;

/**
 * A server from before clubs could connect their own number (its
 * /clubs/whatsapp routes answer FastAPI's bare 404): nothing to connect,
 * and the section stays out of sight -- the rail, the dashboard's card, the
 * pages -- until the backend that has it is deployed. No dashboard deploy
 * is needed then: the next read of the account finds it.
 */
export const NOT_ON_THIS_SERVER: Account = {
  on_server: false,
  available: false,
  plan_allows: true,
  upgrade: null,
  connected: false,
  status: null,
  mode: null,
  waba_id: null,
  phone_number_id: null,
  app_id: null,
  display_phone_number: null,
  verified_name: null,
  token_last4: null,
  quality_rating: null,
  messaging_limit_tier: null,
  quality_checked_at: null,
  verified_at: null,
  last_webhook_at: null,
  last_error: null,
  last_error_code: null,
  routing: true,
  retention_months: 12,
  webhook_url: null,
  verify_token: null,
  webhook_fields: [],
  can_manage: false,
  can_inbox: false,
  impersonated: false,
  warnings: [],
  locked: false,
  number_status: null,
  name_status: null,
  restrictions: [],
};

async function readAccount(): Promise<Account> {
  try {
    return await fetchAccount();
  } catch (error) {
    // Only FastAPI's own 404 for a route that isn't there is a server without the feature;
    // a 404 the backend raised itself (it always carries a message) is an error like any other.
    if (isRouteMissing(error)) return NOT_ON_THIS_SERVER;
    throw error;
  }
}

export function useAccount(enabled = true) {
  return useQuery({ queryKey: ACCOUNT_KEY, queryFn: readAccount, staleTime: 30_000, retry: false, enabled });
}

/**
 * Whether this API has clubs' own WhatsApp at all, from the account's read
 * (shared with the pages, so it costs no request of its own):
 * - `false`: the route isn't there (a route-level 404) -- hide the section;
 * - `true`: it answered, even with a refusal or an error, which a missing
 *   route never gives;
 * - `undefined`: not asked yet (still reading, or `enabled` is false).
 */
export function useWhatsAppOnServer(enabled = true): boolean | undefined {
  const q = useAccount(enabled);
  if (q.data) return q.data.on_server;
  if (q.isError) return true;
  return undefined;
}

export function useOverview(days = 7, enabled = true) {
  return useQuery({ queryKey: [...OVERVIEW_KEY, days], queryFn: () => fetchOverview(days), staleTime: 30_000, retry: false, enabled });
}

/** 403 WHATSAPP_PERMISSION: the signed-in member wasn't given the WhatsApp permission. */
export function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && (error.errorCode === WHATSAPP_PERMISSION || error.errorCode === "ROLE_FORBIDDEN");
}

/** 403 WHATSAPP_PRIVATE: an admin acting as the club, who may not read its messages. */
export function isPrivateError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && error.errorCode === WHATSAPP_PRIVATE;
}

export function forbiddenText(error: unknown): string {
  return isPrivateError(error) ? PRIVATE_MESSAGE : PERMISSION_MESSAGE;
}

function useSettleAccount() {
  const queryClient = useQueryClient();
  return {
    onSuccess: (next: Account) => {
      queryClient.setQueryData(ACCOUNT_KEY, next);
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  };
}

/**
 * The keys are the mutation's variables: gcTime 0 lets them go from the
 * mutation cache the moment nothing watches the save, instead of keeping
 * the token and secret in memory for five minutes.
 */
export function useSaveAccount() {
  return useMutation({ mutationFn: (keys: Keys) => saveAccount(keys), gcTime: 0, ...useSettleAccount() });
}

export function useVerifyAccount() {
  return useMutation({ mutationFn: verifyAccount, ...useSettleAccount() });
}

/** Routing, retention, or the app ID alone. */
export function useUpdateAccount() {
  return useMutation({ mutationFn: updateAccount, ...useSettleAccount() });
}

export function useDisconnectAccount() {
  return useMutation({ mutationFn: disconnectAccount, ...useSettleAccount() });
}

/** Which field a refusal of the keys is about, and the words to show there. */
export type KeysProblem = { field: KeyField | null; text: string };

const said = (error: ApiError, fallback: string) => error.message?.trim() || fallback;

export function keysErrorMessage(error: unknown): KeysProblem {
  if (error instanceof ApiError) {
    const details = (error.fieldErrors ?? {}) as Record<string, unknown>;
    if (error.errorCode === INVALID_WHATSAPP_KEYS) {
      const field = typeof details.field === "string" ? (details.field as KeyField) : null;
      return { field, text: said(error, "Check the keys and paste them again.") };
    }
    if (error.errorCode && error.errorCode in KEY_ERROR_FIELD) {
      if (error.errorCode === "WHATSAPP_UNAVAILABLE") return { field: null, text: UNAVAILABLE_MESSAGE };
      return { field: KEY_ERROR_FIELD[error.errorCode] ?? null, text: said(error, "Meta refused these keys.") };
    }
    if (error.status === 503) return { field: null, text: UNAVAILABLE_MESSAGE };
    if (isPermissionError(error)) return { field: null, text: "Only the club's owner and its admins can change the WhatsApp connection." };
    return { field: null, text: error.message || "That did not go through. Try again." };
  }
  return { field: null, text: error instanceof Error && error.message ? error.message : "That did not go through. Try again." };
}

// ─── The inbox ───────────────────────────────────────────────────────────

/** Conversations a page at a time. */
export const CONVERSATIONS_PAGE = 50;

/**
 * The list, page by page on `offset`. A refresh reads every page loaded so
 * far again, each from where the one before it now ends.
 */
export function useConversations(filter: InboxFilter, q: string, poll: number | false, enabled = true, assignee: string | null = null) {
  return useInfiniteQuery({
    queryKey: [...CONVERSATIONS_KEY, filter, q, assignee],
    queryFn: ({ pageParam }) => fetchConversations({ filter, q, assignee, offset: pageParam, limit: CONVERSATIONS_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    staleTime: 5_000,
    refetchInterval: poll,
    retry: false,
    enabled,
  });
}

/** The pages as one list, each conversation once (one that moved up while paging shows where it is now). */
export function conversationsOf(data: InfiniteData<ConversationList> | undefined): Conversation[] {
  const seen = new Set<number>();
  const out: Conversation[] = [];
  for (const page of data?.pages ?? []) {
    for (const c of page.items) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/** A conversation's messages: the newest page first, then each older one (`before` its oldest). */
export type MessagePages = InfiniteData<MessageList, number | null>;

/**
 * The newest page, and the older ones loaded by "Load older", each before
 * the oldest of the page after it. A refresh reads them again from the
 * newest, each from where the one after it now starts: as new messages
 * arrive, none falls between two pages.
 */
export function useMessages(conversationId: number | null, poll: number | false) {
  return useInfiniteQuery<MessageList, Error, MessagePages, readonly unknown[], number | null>({
    queryKey: [...MESSAGES_KEY, conversationId],
    queryFn: ({ pageParam }) => fetchMessages(conversationId!, { before: pageParam ?? undefined }),
    initialPageParam: null,
    getNextPageParam: (last) => (last.has_more && last.items[0] ? last.items[0].id : undefined),
    enabled: conversationId !== null,
    staleTime: 3_000,
    refetchInterval: poll,
    retry: false,
  });
}

/** Every message loaded, oldest first, each once. */
export function messagesOf(data: MessagePages | undefined): Message[] {
  const seen = new Set<number>();
  const out: Message[] = [];
  for (const page of [...(data?.pages ?? [])].reverse()) {
    for (const m of page.items) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

/** A message as the server kept it, put where it belongs: replacing itself, or last in the newest page. */
export function withMessage(data: MessagePages | undefined, m: Message): MessagePages | undefined {
  if (!data?.pages.length) return data;
  if (data.pages.some((p) => p.items.some((x) => x.id === m.id))) {
    return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === m.id ? m : x)) })) };
  }
  const [newest, ...rest] = data.pages;
  return { ...data, pages: [{ ...newest!, items: [...newest!.items, m] }, ...rest] };
}

/** Everything the inbox shows again: after a send, a read, a change pushed by the stream. */
export function useRefreshInbox() {
  const queryClient = useQueryClient();
  return (conversationId?: number | null) => {
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    if (conversationId === undefined || conversationId === null) void queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
    else void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, conversationId] });
  };
}

/** What the stream's changes ask for (planRefresh): only those queries are read again. */
export function useApplyRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    (plan: RefreshPlan) => {
      if (plan.list) {
        void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
        void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
        void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      }
      // Only the open conversation's is on screen: the others are marked stale, not fetched.
      if (plan.threads === "all") void queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
      else for (const id of plan.threads) void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, id] });
    },
    [queryClient],
  );
}

/**
 * A reply. The message the server answers with goes straight into the
 * conversation (no read of it to see it); a refusal reads it again, since
 * what it said about the window may have changed.
 */
export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient();
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: (body: SendBody) => sendMessage(conversationId, body),
    onSuccess: async (m) => {
      const key = [...MESSAGES_KEY, conversationId];
      // A read already on its way began before this message: it would put back the conversation without it.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<MessagePages>(key, (data) => withMessage(data, m));
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    },
    onError: () => refresh(conversationId),
  });
}

/** A file they were sent (uploadMedia, with its progress): kept like a reply. */
export function usePutSentMessage(conversationId: number) {
  const queryClient = useQueryClient();
  return async (m: Message) => {
    const key = [...MESSAGES_KEY, conversationId];
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<MessagePages>(key, (data) => withMessage(data, m));
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
  };
}

/** The conversation as it now is, wherever it is shown: the thread's header and the list's row. */
function useSetConversation() {
  const queryClient = useQueryClient();
  return (c: Conversation) => {
    queryClient.setQueryData<MessagePages>([...MESSAGES_KEY, c.id], (data) =>
      data?.pages.length ? { ...data, pages: data.pages.map((p, i) => (i === 0 ? { ...p, conversation: c } : p)) } : data,
    );
    queryClient.setQueriesData<InfiniteData<ConversationList>>({ queryKey: CONVERSATIONS_KEY }, (data) =>
      data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === c.id ? c : x)) })) } : data,
    );
  };
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  const set = useSetConversation();
  return useMutation({
    mutationFn: (conversationId: number) => markRead(conversationId),
    onSuccess: (c) => {
      set(c);
      // The unread counts: the filter's, the overview's, the nav's and the bell's.
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["club-alerts"] });
    },
  });
}

export function useSetConversationStatus() {
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "open" | "closed" }) => setConversationStatus(id, status),
    onSuccess: (c) => refresh(c.id),
  });
}

/**
 * Any refusal of the inbox's, in words: the server's own sentence when it
 * gave one, else this page's for its code (ERROR_TEXT), else a plain "try again".
 */
export function errorText(error: unknown, fallback = "That did not go through. Try again."): string {
  if (error instanceof ApiError) {
    if (error.isForbidden && (error.errorCode === WHATSAPP_PERMISSION || error.errorCode === WHATSAPP_PRIVATE)) return forbiddenText(error);
    return error.message?.trim() || (error.errorCode ? ERROR_TEXT[error.errorCode] : undefined) || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Whether a refusal to block offers a block here instead (after 24 hours, a full blocklist). */
export function offersLocalBlock(error: unknown): boolean {
  return error instanceof ApiError && Boolean((error.fieldErrors as Record<string, unknown> | null)?.local_available);
}

/** A refusal from sending, in words for the thread. */
export function sendErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode && ["OPTED_OUT", "OPTED_OUT_MARKETING", "CONTACT_BLOCKED", "CANT_REPLY_TO_IT", "MEDIA_TYPE", "MEDIA_TOO_LARGE",
      "MEDIA_SIZE_MISMATCH", "CAPTION_TOO_LONG", "CAPTION_NOT_ALLOWED", "MEDIA_REFUSED"].includes(error.errorCode)) {
      return error.message?.trim() || ERROR_TEXT[error.errorCode]!;
    }
    // A 413 with no code of ours: a proxy on the way (the dashboard's host, Cloudflare) refused the size first.
    if (error.status === 413 && !error.errorCode) return "That file is too large to pass on from here. Send a smaller one.";
    if (error.errorCode === "UPLOAD_INTERRUPTED") return error.message?.trim() || ERROR_TEXT.UPLOAD_INTERRUPTED!;
    if (error.errorCode === WINDOW_CLOSED) return "It's been more than 24 hours since they last wrote. Send an approved template instead.";
    if (error.errorCode === TEMPLATE_NOT_APPROVED) return "That template isn't approved on your WhatsApp account. Refresh the templates and pick an approved one.";
    if (error.errorCode === WHATSAPP_FAILED) return "Your WhatsApp number isn't working right now. Check it in WhatsApp settings.";
    if (error.errorCode === NO_WHATSAPP) return "Connect your WhatsApp number first.";
    if (error.errorCode === INVALID_TEMPLATE) return error.message || "Fill in every value the template needs.";
    if (error.isForbidden) return forbiddenText(error);
    return error.message || "That did not go through. Try again.";
  }
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}

// ─── Templates ───────────────────────────────────────────────────────────

export function useTemplates(refresh = true, enabled = true) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, refresh ? "live" : "kept"],
    queryFn: () => fetchTemplates(refresh),
    staleTime: refresh ? 30_000 : 60_000,
    retry: false,
    enabled,
  });
}

function useSettleTemplates() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
}

export function useCreateTemplate() {
  const settle = useSettleTemplates();
  return useMutation({ mutationFn: (form: TemplateForm) => createTemplate(form), onSuccess: settle });
}

export function useDeleteTemplate() {
  const settle = useSettleTemplates();
  return useMutation({ mutationFn: ({ name, language }: { name: string; language?: string | null }) => deleteTemplate(name, language), onSuccess: settle });
}

export function useInstallStandard() {
  const settle = useSettleTemplates();
  return useMutation({ mutationFn: installStandardTemplates, onSuccess: settle });
}

/** The fields the template form shows a refusal beside; one it doesn't show goes on the form. */
const TEMPLATE_FIELDS = /^(name|language|category|header|header_examples|body|body_examples|footer|buttons(\.\d+)?)$/;

/**
 * A template refusal from the server: on the field it names (`errors.field`),
 * or the form's. INVALID_TEMPLATE carries Meta's own words when Meta refused
 * it, which are shown as they are.
 */
export function templateErrorMessage(error: unknown): TemplateProblem {
  if (error instanceof ApiError) {
    const details = (error.fieldErrors ?? {}) as Record<string, unknown>;
    if (error.errorCode === INVALID_TEMPLATE) {
      const field = typeof details.field === "string" && TEMPLATE_FIELDS.test(details.field) ? details.field : "form";
      return { field, text: error.message?.trim() || "Meta wouldn't take that." };
    }
    return { field: "form", text: error.message || "That did not go through. Try again." };
  }
  return { field: "form", text: error instanceof Error && error.message ? error.message : "That did not go through. Try again." };
}

// ─── The inbox as a team's ───────────────────────────────────────────────

/**
 * What waits (counts only): the nav's badge and the tab's "(n)". `null` from a
 * server without the route; nothing at all for someone the inbox isn't for
 * (`enabled` false, or a 403: the badge just isn't shown).
 */
export function useSummary(enabled = true) {
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => nullIfRouteMissing(fetchSummary),
    // Not asked again of a server without it, nor after a refusal (no permission): no badge then.
    refetchInterval: (query) => (query.state.data === null || query.state.status === "error" ? false : 60_000),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

/**
 * Whether this API has the inbox's team features (summary, assigning,
 * notes, blocks, files, saved replies), from the summary's read (the nav's
 * badge asks it anyway): `false` when its route answers a bare 404 -- a
 * backend with #106 but not these -- and then none of their controls is
 * shown; `true` once it answers anything else; `undefined` until asked.
 */
export function useInboxTeamOnServer(enabled = true): boolean | undefined {
  const q = useSummary(enabled);
  if (q.data === null) return false;
  if (q.data || q.isError) return true;
  return undefined;
}

export function useTeam(enabled = true) {
  return useQuery({ queryKey: TEAM_KEY, queryFn: fetchTeam, staleTime: 60_000, retry: false, enabled });
}

/** The conversation as it now is, everywhere it is shown, and what counts it changes. */
function useSettleConversation() {
  const queryClient = useQueryClient();
  const set = useSetConversation();
  return (c: Conversation) => {
    set(c);
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
  };
}

export function useAssign() {
  const settle = useSettleConversation();
  return useMutation({
    mutationFn: ({ id, owner, memberId }: { id: number; owner?: boolean; memberId?: number | null }) =>
      assignConversation(id, owner ? { owner: true } : memberId ? { member_id: memberId } : {}),
    onSuccess: settle,
  });
}

export function useBlock() {
  const settle = useSettleConversation();
  return useMutation({ mutationFn: ({ id, localOnly }: { id: number; localOnly?: boolean }) => blockConversation(id, Boolean(localOnly)), onSuccess: settle });
}

export function useUnblock() {
  const settle = useSettleConversation();
  return useMutation({ mutationFn: ({ id, localOnly }: { id: number; localOnly?: boolean }) => unblockConversation(id, Boolean(localOnly)), onSuccess: settle });
}

export function useOptOut() {
  const settle = useSettleConversation();
  return useMutation({
    mutationFn: ({ id, out, scope }: { id: number; out: boolean; scope?: "all" | "marketing" }) =>
      out ? optOutConversation(id, scope ?? "all") : optInConversation(id, scope ?? "all"),
    onSuccess: settle,
  });
}

export function useNotes(conversationId: number, enabled = true) {
  return useQuery({ queryKey: [...NOTES_KEY, conversationId], queryFn: () => fetchNotes(conversationId), staleTime: 15_000, retry: false, enabled });
}

export function useAddNote(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addNote(conversationId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...NOTES_KEY, conversationId] });
      void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, conversationId] });
    },
  });
}

export function useDeleteNote(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: number) => deleteNote(conversationId, noteId),
    onSuccess: (list) => {
      queryClient.setQueryData([...NOTES_KEY, conversationId], list);
      void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, conversationId] });
    },
  });
}

export function useSavedReplies(enabled = true) {
  return useQuery({ queryKey: SAVED_REPLIES_KEY, queryFn: fetchSavedReplies, staleTime: 60_000, retry: false, enabled });
}

export function useSaveReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number | null; body: SavedReplyBody }) => (id ? updateSavedReply(id, body) : createSavedReply(body)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SAVED_REPLIES_KEY }),
  });
}

export function useDeleteReply() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: deleteSavedReply, onSuccess: (list) => queryClient.setQueryData(SAVED_REPLIES_KEY, list) });
}

export function useInboxSettings(enabled = true) {
  return useQuery({ queryKey: INBOX_SETTINGS_KEY, queryFn: () => nullIfRouteMissing(fetchInboxSettings), staleTime: 30_000, retry: false, enabled });
}

export function useUpdateInboxSettings() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: updateInboxSettings, onSuccess: (next) => queryClient.setQueryData(INBOX_SETTINGS_KEY, next) });
}

export function useUpdateMyNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyNotifications,
    onSuccess: (me) => queryClient.setQueryData<InboxSettings | null>(INBOX_SETTINGS_KEY, (s) => (s ? { ...s, me } : s)),
  });
}
