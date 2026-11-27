"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMayReadMail } from "@/features/platform-mail";

import { fetchConversations, fetchTemplates, fetchThread, fetchUnread, markRead, sendReply, type ConversationFilters, type Reply } from "./api";

export const WA_KEY = ["admin", "whatsapp-inbox"] as const;
export const UNREAD_KEY = [...WA_KEY, "unread"] as const;

/** How often the list and the side menu's count are asked again; an open thread, more often. */
export const LIST_POLL_MS = 15_000;
export const THREAD_POLL_MS = 8_000;
export const UNREAD_POLL_MS = 60_000;

/** The same roles as the platform's mail: owner and support. */
export const useMayReadWhatsApp = useMayReadMail;

/** The side menu's count, which doubles as the probe: `null` on an API without the inbox. */
export function useWhatsAppUnread(enabled = true) {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnread,
    refetchInterval: (query) => (query.state.data === null || query.state.status === "error" ? false : UNREAD_POLL_MS),
    refetchOnWindowFocus: true,
    staleTime: UNREAD_POLL_MS / 2,
    retry: false,
    enabled,
  });
}

export function useConversations(filters: ConversationFilters) {
  return useQuery({
    queryKey: [...WA_KEY, "list", filters],
    queryFn: () => fetchConversations(filters),
    refetchInterval: LIST_POLL_MS,
    placeholderData: (previous) => previous,
  });
}

export function useThread(id: number | null) {
  return useQuery({
    queryKey: [...WA_KEY, "thread", id],
    queryFn: () => fetchThread(id!),
    enabled: id !== null,
    refetchInterval: THREAD_POLL_MS,
  });
}

export function useManualTemplates() {
  return useQuery({ queryKey: [...WA_KEY, "templates"], queryFn: fetchTemplates, staleTime: 10 * 60_000 });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: (unread) => {
      qc.setQueryData(UNREAD_KEY, unread);
      void qc.invalidateQueries({ queryKey: [...WA_KEY, "list"] });
    },
  });
}

export function useSendReply(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reply: Reply) => sendReply(id, reply),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [...WA_KEY, "thread", id] });
      void qc.invalidateQueries({ queryKey: [...WA_KEY, "list"] });
    },
  });
}
