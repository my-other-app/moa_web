"use client";

import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ApiError, isRouteMissing, nullIfRouteMissing } from "@moa/api";

import type { RefreshPlan } from "@/features/whatsapp/stream";

import {
  deleteThread,
  fetchMailbox,
  fetchSummary,
  fetchThread,
  fetchThreads,
  markThreadRead,
  markThreadUnread,
  moveThread,
  retryMail,
  saveAddress,
  saveSettings,
  saveSignature,
  sendMail,
  wipeMail,
  type Outgoing,
} from "./api";
import {
  ERROR_TEXT,
  MAILBOX_PERMISSION,
  MAILBOX_PRIVATE,
  PERMISSION_MESSAGE,
  PRIVATE_MESSAGE,
  mailboxSchema,
  type Folder,
  type Mailbox,
  type MailThread,
  type ThreadDetail,
  type ThreadList,
} from "./schemas";

export const MAIL_KEY = ["mailbox"] as const;
export const MAILBOX_KEY = [...MAIL_KEY, "status"] as const;
export const SUMMARY_KEY = [...MAIL_KEY, "summary"] as const;
export const THREADS_KEY = [...MAIL_KEY, "threads"] as const;
export const THREAD_KEY = [...MAIL_KEY, "thread"] as const;

/**
 * A server from before club mailboxes (its /clubs/mailbox answers FastAPI's
 * bare 404): nothing to show, and the section stays out of sight until the
 * backend that has it is deployed -- the next read finds it.
 */
export const NOT_ON_THIS_SERVER: Mailbox = { ...mailboxSchema.parse({}), on_server: false, available: false };

async function readMailbox(): Promise<Mailbox> {
  const answer = await nullIfRouteMissing(fetchMailbox);
  return answer ?? NOT_ON_THIS_SERVER;
}

export function useMailbox(enabled = true) {
  return useQuery({ queryKey: MAILBOX_KEY, queryFn: readMailbox, staleTime: 30_000, retry: false, enabled });
}

/**
 * Whether this API has club mailboxes *and has them switched on*, from the
 * status's read (shared with the pages):
 * - `false`: the route isn't there (a route-level 404), the server has them
 *   off (`available: false`), or the read failed -- hide the section;
 * - `true`: it answered that they are on;
 * - `undefined`: not asked yet.
 */
export function useMailboxOnServer(enabled = true): boolean | undefined {
  const q = useMailbox(enabled);
  if (q.data) return q.data.on_server && q.data.available;
  if (q.isError) return false;
  if (!enabled) return false;
  return undefined;
}

/**
 * What waits unread (counts only): the nav's badge and the tab's "(n)".
 * `null` from a server without the route; nothing for someone the mail
 * isn't for (`enabled` false, or a refusal: no badge then).
 */
export function useMailSummary(enabled = true) {
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => nullIfRouteMissing(fetchSummary),
    refetchInterval: (query) => (query.state.data === null || query.state.status === "error" ? false : 60_000),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

export const THREADS_PAGE = 30;

export function useThreads(folder: Folder, q: string, unread: boolean, poll: number | false, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...THREADS_KEY, folder, q, unread],
    queryFn: ({ pageParam }) => fetchThreads({ folder, q, unread, offset: pageParam, limit: THREADS_PAGE }),
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

/** The pages as one list, each thread once. */
export function threadsOf(data: InfiniteData<ThreadList> | undefined): MailThread[] {
  const seen = new Set<number>();
  const out: MailThread[] = [];
  for (const page of data?.pages ?? []) {
    for (const t of page.items) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function useThread(threadId: number | null, poll: number | false) {
  return useQuery({
    queryKey: [...THREAD_KEY, threadId],
    queryFn: () => fetchThread(threadId!),
    enabled: threadId !== null,
    staleTime: 3_000,
    refetchInterval: poll,
    retry: false,
  });
}

/** Everything the mailbox shows again: after a send, a move, a change the stream pushed. */
export function useRefreshMail() {
  const queryClient = useQueryClient();
  return useCallback(
    (threadId?: number | null) => {
      void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      if (threadId === undefined || threadId === null) void queryClient.invalidateQueries({ queryKey: THREAD_KEY });
      else void queryClient.invalidateQueries({ queryKey: [...THREAD_KEY, threadId] });
    },
    [queryClient],
  );
}

/** What the stream's changes ask for (planRefresh): only those are read again. */
export function useApplyMailRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    (plan: RefreshPlan) => {
      if (plan.list) {
        void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
        void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      }
      if (plan.threads === "all") void queryClient.invalidateQueries({ queryKey: THREAD_KEY });
      else for (const id of plan.threads) void queryClient.invalidateQueries({ queryKey: [...THREAD_KEY, id] });
    },
    [queryClient],
  );
}

/** The thread's row as it now is (its counts, its folder), where the open thread shows it too. */
function useSettleThread() {
  const queryClient = useQueryClient();
  return (t: MailThread) => {
    queryClient.setQueryData<ThreadDetail>([...THREAD_KEY, t.id], (d) => (d ? { ...d, thread: t } : d));
    // The folder's list, the unread counts (the nav's) and the bell's notice for it.
    void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["club-alerts"] });
  };
}

export function useMarkRead() {
  const settle = useSettleThread();
  return useMutation({ mutationFn: (threadId: number) => markThreadRead(threadId), onSuccess: settle });
}

export function useMarkUnread() {
  const settle = useSettleThread();
  return useMutation({ mutationFn: (threadId: number) => markThreadUnread(threadId), onSuccess: settle });
}

export function useMoveThread() {
  const settle = useSettleThread();
  return useMutation({ mutationFn: ({ id, folder }: { id: number; folder: "inbox" | "archive" | "spam" }) => moveThread(id, folder), onSuccess: settle });
}

export function useDeleteThread() {
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (threadId: number) => deleteThread(threadId), onSuccess: () => refresh() });
}

export function useSendMail() {
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (o: Outgoing) => sendMail(o), onSuccess: (m) => refresh(m.thread_id) });
}

export function useRetryMail() {
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (messageId: number) => retryMail(messageId), onSuccess: (m) => refresh(m.thread_id) });
}

function useSettleMailbox() {
  const queryClient = useQueryClient();
  return (next: Mailbox) => queryClient.setQueryData(MAILBOX_KEY, next);
}

export function useSaveAddress() {
  return useMutation({ mutationFn: (handle: string) => saveAddress(handle), onSuccess: useSettleMailbox() });
}

export function useSaveSettings() {
  return useMutation({ mutationFn: saveSettings, onSuccess: useSettleMailbox() });
}

export function useSaveSignature() {
  return useMutation({ mutationFn: (signature: string) => saveSignature(signature), onSuccess: useSettleMailbox() });
}

export function useWipeMail() {
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: wipeMail, onSuccess: () => refresh() });
}

// ─── Refusals, in words ──────────────────────────────────────────────────

export function isPrivateError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && error.errorCode === MAILBOX_PRIVATE;
}

export function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && error.errorCode === MAILBOX_PERMISSION;
}

export function isLapsedError(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === "MAILBOX_LAPSED";
}

export { isRouteMissing };

/**
 * Any refusal in words: the server's own sentence when it gave one, else
 * this page's for its code, else a plain "try again". A 413 with no code of
 * ours is a proxy on the way refusing the size first.
 */
export function errorText(error: unknown, fallback = "That did not go through. Try again."): string {
  if (error instanceof ApiError) {
    if (error.errorCode === MAILBOX_PRIVATE) return PRIVATE_MESSAGE;
    if (error.errorCode === MAILBOX_PERMISSION) return PERMISSION_MESSAGE;
    if (error.status === 413 && !error.errorCode) return "Those files are too large to pass on from here. Send smaller ones.";
    return error.message?.trim() || (error.errorCode ? ERROR_TEXT[error.errorCode] : undefined) || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
