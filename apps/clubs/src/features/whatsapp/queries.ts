"use client";

import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import {
  createTemplate,
  deleteTemplate,
  disconnectAccount,
  fetchAccount,
  fetchConversations,
  fetchMessages,
  fetchOverview,
  fetchTemplates,
  installStandardTemplates,
  markRead,
  saveAccount,
  sendMessage,
  setConversationStatus,
  updateAccount,
  verifyAccount,
  type SendBody,
} from "./api";
import {
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

/** A server from before clubs could connect their own number: nothing to connect. */
export const NOT_ON_THIS_SERVER: Account = {
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
};

async function readAccount(): Promise<Account> {
  try {
    return await fetchAccount();
  } catch (error) {
    // A bare 404 (no code) is a server without the feature.
    if (error instanceof ApiError && error.isNotFound && !error.errorCode) return NOT_ON_THIS_SERVER;
    throw error;
  }
}

export function useAccount() {
  return useQuery({ queryKey: ACCOUNT_KEY, queryFn: readAccount, staleTime: 30_000, retry: false });
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
export function useConversations(filter: InboxFilter, q: string, poll: number | false, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...CONVERSATIONS_KEY, filter, q],
    queryFn: ({ pageParam }) => fetchConversations({ filter, q, offset: pageParam, limit: CONVERSATIONS_PAGE }),
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
    },
    onError: () => refresh(conversationId),
  });
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
      // The unread counts: the filter's and the overview's.
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
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

/** A refusal from sending, in words for the thread. */
export function sendErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
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
