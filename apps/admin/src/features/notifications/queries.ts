"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { fetchNotifications, fetchUnreadCount, markAllRead, markRead, type NotificationQuery } from "./api";

const KEY = ["admin-alerts"] as const;

/** How often the bell asks: often enough to notice a failed charge the same hour, cheap enough to leave on. */
export const UNREAD_POLL_MS = 60_000;

export function useUnreadCount() {
  return useQuery({
    queryKey: [...KEY, "unread"],
    queryFn: fetchUnreadCount,
    refetchInterval: UNREAD_POLL_MS,
    staleTime: UNREAD_POLL_MS / 2,
  });
}

export function useNotifications(query: NotificationQuery, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "list", query],
    queryFn: () => fetchNotifications(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

export function useMarkRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Could not mark it read"),
  });
}

/** Marks all read, or only one kind's when the list is filtered to it. */
export function useMarkAllRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (kind?: string | null) => markAllRead(kind),
    onSuccess: async (result) => {
      toast.success(result.unread ? `${result.updated} marked read · ${result.unread} still unread` : "All caught up");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not mark them read"),
  });
}
