"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { applyToUpcoming, fetchClubSpeaker, fetchClubSpeakers, saveContact, suggestSpeakers, type ContactInput } from "./api";

export const SPEAKERS_KEY = ["clubs", "speakers"] as const;

/** The picker's suggestions for what is typed; `null` on an API without the directory. */
export function useSpeakerSuggestions(q: string, enabled = true) {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "suggest", q.trim()], queryFn: () => suggestSpeakers(q), enabled, placeholderData: keepPreviousData, retry: false, staleTime: 30_000 });
}

/** Whether the API has the speakers directory: the picker's first read is the probe. */
export function useSpeakersOnServer(enabled = true): boolean | undefined {
  const q = useSpeakerSuggestions("", enabled);
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

export function useClubSpeakers(q: string, page: number, pageSize: number) {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "list", q.trim(), page, pageSize], queryFn: () => fetchClubSpeakers(q, page, pageSize), placeholderData: keepPreviousData, retry: false });
}

export function useClubSpeaker(profileId: number | null) {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "one", profileId], queryFn: () => fetchClubSpeaker(profileId!), enabled: profileId !== null });
}

export function useSaveContact(profileId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) => saveContact(profileId, input),
    onSuccess: async () => {
      toast.success("Contact saved: only your club sees it");
      await queryClient.invalidateQueries({ queryKey: SPEAKERS_KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the contact"),
  });
}

export function useApplyToUpcoming(profileId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => applyToUpcoming(profileId),
    onSuccess: async (r) => {
      const n = r?.updated ?? 0;
      toast.success(n ? `Updated on ${n} upcoming event${n === 1 ? "" : "s"}` : "No upcoming events to update");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the upcoming events"),
  });
}
