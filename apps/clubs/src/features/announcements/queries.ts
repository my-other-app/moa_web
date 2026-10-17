"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";
import { toastError } from "@/features/plan/errors";

import { fetchAnnouncementHistory, fetchPushAudience, fetchPushHistory, fetchPushInsights, sendAnnouncement } from "./api";
import type { PushScope, SendAnnouncementInput } from "./schemas";

export function useAnnouncementHistory(params: { offset: number; limit: number }) {
  return useQuery({
    queryKey: qk.notifications.history(params),
    queryFn: () => fetchAnnouncementHistory(params),
    placeholderData: keepPreviousData,
  });
}

export function useSendAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: number; input: SendAnnouncementInput }) =>
      sendAnnouncement(eventId, input),
    onSuccess: async (sent) => {
      toast.success(sent > 0 ? `Announcement sent to ${sent.toLocaleString("en-IN")} ${sent === 1 ? "phone" : "phones"}` : "Announcement sent");
      // The month's count of announcements moved.
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      await queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    },
    onError: toastError,
  });
}

export function usePushHistory(params: { scope: PushScope; search?: string | undefined; offset: number; limit: number }) {
  return useQuery({ queryKey: [...qk.notifications.all, "page", params], queryFn: () => fetchPushHistory(params), staleTime: 15_000, placeholderData: keepPreviousData });
}

export function usePushInsights() {
  return useQuery({ queryKey: [...qk.notifications.all, "insights"], queryFn: fetchPushInsights, staleTime: 60_000 });
}

export function usePushAudience(eventId: number | null) {
  return useQuery({ queryKey: [...qk.notifications.all, "audience", eventId], queryFn: () => fetchPushAudience(eventId as number), enabled: eventId !== null && eventId > 0, staleTime: 30_000 });
}
