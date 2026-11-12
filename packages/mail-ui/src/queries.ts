"use client";

import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import type { Outgoing, ThreadQuery } from "./client";
import { useMailConfig } from "./context";
import { MAIL_ERROR_TEXT, type MailThread, type ThreadDetail, type ThreadList } from "./schemas";

export const THREADS_PAGE = 30;

/** A folder's conversations, page after page ("Load more"), polled while on screen. */
export function useThreads(query: Omit<ThreadQuery, "offset" | "limit">, poll: number | false, enabled = true, pageSize = THREADS_PAGE) {
  const { client, keys } = useMailConfig();
  const { folder, q = "", unread = false, mailbox = null } = query;
  return useInfiniteQuery({
    queryKey: [...keys.threads, folder, q, unread, mailbox],
    queryFn: ({ pageParam }) => client.fetchThreads({ folder, q, unread, mailbox, offset: pageParam, limit: pageSize }),
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
  const { client, keys } = useMailConfig();
  return useQuery({
    queryKey: [...keys.thread, threadId],
    queryFn: () => client.fetchThread(threadId!),
    enabled: threadId !== null,
    staleTime: 3_000,
    refetchInterval: poll,
    retry: false,
  });
}

/** Everything the mailbox shows again: after a send, a move, a change the stream pushed. */
export function useRefreshMail() {
  const queryClient = useQueryClient();
  const { keys, alsoRefresh } = useMailConfig();
  return useCallback(
    (threadId?: number | null) => {
      void queryClient.invalidateQueries({ queryKey: keys.threads });
      if (keys.summary) void queryClient.invalidateQueries({ queryKey: keys.summary });
      for (const key of alsoRefresh ?? []) void queryClient.invalidateQueries({ queryKey: key });
      if (threadId === undefined || threadId === null) void queryClient.invalidateQueries({ queryKey: keys.thread });
      else void queryClient.invalidateQueries({ queryKey: [...keys.thread, threadId] });
    },
    [queryClient, keys, alsoRefresh],
  );
}

/** What a live stream's changes ask for: the list (and the counts), every conversation, or these. */
export interface MailRefreshPlan {
  list: boolean;
  threads: "all" | number[];
}

/** Only what the stream's changes ask for is read again. */
export function useApplyMailRefresh() {
  const queryClient = useQueryClient();
  const { keys } = useMailConfig();
  return useCallback(
    (plan: MailRefreshPlan) => {
      if (plan.list) {
        void queryClient.invalidateQueries({ queryKey: keys.threads });
        if (keys.summary) void queryClient.invalidateQueries({ queryKey: keys.summary });
      }
      if (plan.threads === "all") void queryClient.invalidateQueries({ queryKey: keys.thread });
      else for (const id of plan.threads) void queryClient.invalidateQueries({ queryKey: [...keys.thread, id] });
    },
    [queryClient, keys],
  );
}

/** The thread's row as it now is (its counts, its folder), where the open thread shows it too. */
function useSettleThread() {
  const queryClient = useQueryClient();
  const { keys, alsoRefresh } = useMailConfig();
  return (t: MailThread) => {
    queryClient.setQueryData<ThreadDetail>([...keys.thread, t.id], (d) => (d ? { ...d, thread: t } : d));
    // The folder's list, the unread counts (the nav's) and, say, the bell's notice for it.
    void queryClient.invalidateQueries({ queryKey: keys.threads });
    if (keys.summary) void queryClient.invalidateQueries({ queryKey: keys.summary });
    for (const key of alsoRefresh ?? []) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function useMarkRead() {
  const { client } = useMailConfig();
  const settle = useSettleThread();
  return useMutation({ mutationFn: (threadId: number) => client.markRead(threadId), onSuccess: settle });
}

export function useMarkUnread() {
  const { client } = useMailConfig();
  const settle = useSettleThread();
  return useMutation({ mutationFn: (threadId: number) => client.markUnread(threadId), onSuccess: settle });
}

export function useMoveThread() {
  const { client } = useMailConfig();
  const settle = useSettleThread();
  return useMutation({ mutationFn: ({ id, folder }: { id: number; folder: "inbox" | "archive" | "spam" }) => client.moveThread(id, folder), onSuccess: settle });
}

export function useDeleteThread() {
  const { client } = useMailConfig();
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (threadId: number) => client.deleteThread(threadId), onSuccess: () => refresh() });
}

export function useSendMail() {
  const { client } = useMailConfig();
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (o: Outgoing) => client.sendMail(o), onSuccess: (m) => refresh(m.thread_id) });
}

export function useRetryMail() {
  const { client } = useMailConfig();
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: (messageId: number) => client.retryMail(messageId), onSuccess: (m) => refresh(m.thread_id) });
}

// ─── Refusals, in words ──────────────────────────────────────────────────

export function isLapsedError(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === "MAILBOX_LAPSED";
}

/**
 * Any refusal in words: the server's own sentence when it gave one, else
 * the table's for its code, else a plain "try again". A 413 with no code of
 * ours is a proxy on the way refusing the size first.
 */
export function mailErrorText(error: unknown, fallback = "That did not go through. Try again.", table: Record<string, string> = MAIL_ERROR_TEXT): string {
  if (error instanceof ApiError) {
    if (error.status === 413 && !error.errorCode) return "Those files are too large to pass on from here. Send smaller ones.";
    return error.message?.trim() || (error.errorCode ? table[error.errorCode] : undefined) || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The mailbox's own way of saying a refusal, or the shared one. */
export function useErrorText(): (error: unknown, fallback?: string) => string {
  const { describeError } = useMailConfig();
  return describeError ?? mailErrorText;
}
