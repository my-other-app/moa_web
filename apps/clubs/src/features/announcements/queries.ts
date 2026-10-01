"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchAnnouncementHistory, sendAnnouncement } from "./api";
import type { SendAnnouncementInput } from "./schemas";

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
    onSuccess: async () => {
      toast.success("Announcement sent");
      await queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
