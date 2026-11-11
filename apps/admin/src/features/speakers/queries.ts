"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import {
  dismissDuplicate,
  fetchDuplicates,
  fetchSpeaker,
  fetchSpeakers,
  hideSpeaker,
  inviteSpeaker,
  mergeSpeakers,
  removeOnRequest,
  setSpeakerPhoto,
  unhideSpeaker,
  unmergeSpeaker,
  updateSpeaker,
  type SpeakerQuery,
} from "./api";
import type { SpeakerPatch } from "./schemas";

export const SPEAKERS_KEY = ["admin", "speakers"] as const;

export function useSpeakers(query: SpeakerQuery) {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "list", query], queryFn: () => fetchSpeakers(query), placeholderData: keepPreviousData, retry: false });
}

/** Whether the API has the directory: a one-row read of the list, shared by the menu. */
export function useSpeakersOnServer(): boolean | undefined {
  const q = useSpeakers({ page: 1, pageSize: 1 });
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

export function useSpeaker(id: number) {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "one", id], queryFn: () => fetchSpeaker(id) });
}

export function useDuplicates(status: "open" | "merged" | "dismissed" = "open") {
  return useQuery({ queryKey: [...SPEAKERS_KEY, "duplicates", status], queryFn: () => fetchDuplicates(status) });
}

function useAct<I>(fn: (input: I) => Promise<unknown>, done: string, fallback: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: SPEAKERS_KEY });
    },
    onError: (error: Error) => toast.error(error.message || fallback),
  });
}

export const useHideSpeaker = () => useAct((id: number) => hideSpeaker(id), "Hidden: no longer suggested; event pages keep it", "Could not hide the speaker");
export const useUnhideSpeaker = () => useAct((id: number) => unhideSpeaker(id), "Shown again", "Could not show the speaker again");
export const useRemoveOnRequest = () => useAct((id: number) => removeOnRequest(id), "Removed: hidden, and every club's contact details deleted", "Could not remove the speaker");
export const useUnmergeSpeaker = () => useAct((id: number) => unmergeSpeaker(id), "Merge taken back: both profiles stand on their own", "Could not take the merge back");
export const useInviteSpeaker = () => useAct(({ id, email }: { id: number; email: string }) => inviteSpeaker(id, email), "Invite sent", "Could not send the invite");
export const useMergeSpeakers = () => useAct(({ keepId, mergeId }: { keepId: number; mergeId: number }) => mergeSpeakers(keepId, mergeId), "Merged into one profile", "Could not merge them");
export const useDismissDuplicate = () => useAct((id: number) => dismissDuplicate(id), "Kept apart: two different people", "Could not dismiss the pair");
export const useUpdateSpeaker = () => useAct(({ id, patch }: { id: number; patch: SpeakerPatch }) => updateSpeaker(id, patch), "Profile saved", "Could not save the profile");
export const useSpeakerPhoto = () => useAct(({ id, photo }: { id: number; photo: File }) => setSpeakerPhoto(id, photo), "Photo changed", "Could not change the photo");
