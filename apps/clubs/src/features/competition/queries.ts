"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import * as api from "./api";
import type { Competition } from "./schemas";

const key = (eventId: number) => ["competition", eventId] as const;

export function useCompetition(eventId: number) {
  return useQuery({ queryKey: key(eventId), queryFn: () => api.fetchCompetition(eventId), staleTime: 10_000, refetchInterval: 30_000 });
}

/**
 * Every change answers with the whole competition, so each mutation writes
 * it straight into the cache: the screen never shows a stale half.
 */
function useWrite<TArgs>(eventId: number, run: (args: TArgs) => Promise<Competition>, done?: string | ((args: TArgs) => string)) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (data, args) => {
      queryClient.setQueryData(key(eventId), data);
      if (done) toast.success(typeof done === "function" ? done(args) : done);
    },
    onError: toastError,
  });
}

export const usePatchSettings = (eventId: number) => useWrite(eventId, (patch: Parameters<typeof api.patchSettings>[1]) => api.patchSettings(eventId, patch));
export const useAddTrack = (eventId: number) => useWrite(eventId, (body: api.TrackBody) => api.addTrack(eventId, body), "Track added");
export const usePatchTrack = (eventId: number) => useWrite(eventId, ({ id, body }: { id: number; body: Partial<api.TrackBody> & { sort_order?: number } }) => api.patchTrack(eventId, id, body));
export const useDeleteTrack = (eventId: number) => useWrite(eventId, (id: number) => api.deleteTrack(eventId, id), "Track removed");
export const useCreateTeam = (eventId: number) => useWrite(eventId, (body: Parameters<typeof api.createTeam>[1]) => api.createTeam(eventId, body), "Team made");
export const usePatchTeam = (eventId: number) => useWrite(eventId, ({ id, body }: { id: number; body: Parameters<typeof api.patchTeam>[2] }) => api.patchTeam(eventId, id, body));
export const useDeleteTeam = (eventId: number) => useWrite(eventId, (id: number) => api.deleteTeam(eventId, id), "Team dissolved");
export const useAddMember = (eventId: number) => useWrite(eventId, ({ teamId, registrationId }: { teamId: number; registrationId: string }) => api.addMember(eventId, teamId, registrationId));
export const useRemoveMember = (eventId: number) => useWrite(eventId, ({ teamId, registrationId }: { teamId: number; registrationId: string }) => api.removeMember(eventId, teamId, registrationId));
export const useSubmissionsAction = (eventId: number) => useWrite(eventId, (action: "close" | "reopen") => api.submissionsAction(eventId, action), (a) => (a === "close" ? "Submissions closed" : "Submissions open again"));
export const useAddJudge = (eventId: number) => useWrite(eventId, (body: { name: string; email?: string | null }) => api.addJudge(eventId, body), "Judge added");
export const useDeleteJudge = (eventId: number) => useWrite(eventId, (id: number) => api.deleteJudge(eventId, id), "Judge removed");
export const usePutScore = (eventId: number) => useWrite(eventId, ({ judgeId, teamId, scores, note }: { judgeId: number; teamId: number; scores: Record<string, number>; note?: string | null }) => api.putScore(eventId, judgeId, teamId, scores, note));
export const useAdvance = (eventId: number) => useWrite(eventId, ({ to, size }: { to: "shortlisted" | "finalist"; size?: number }) => api.advance(eventId, to, size), ({ to }) => (to === "shortlisted" ? "Shortlist set" : "Finalists set"));
export const useAddMentor = (eventId: number) => useWrite(eventId, (body: { name: string; topic?: string | null }) => api.addMentor(eventId, body), "Mentor added");
export const useDeleteMentor = (eventId: number) => useWrite(eventId, (id: number) => api.deleteMentor(eventId, id), "Mentor removed");
export const useMakeSlots = (eventId: number) => useWrite(eventId, ({ mentorId, startsAt, endsAt }: { mentorId: number; startsAt: string; endsAt: string }) => api.makeSlots(eventId, mentorId, startsAt, endsAt), "Slots opened");
export const useSetSlot = (eventId: number) => useWrite(eventId, ({ slotId, teamId }: { slotId: number; teamId: number | null }) => api.setSlot(eventId, slotId, teamId));
export const useDeleteSlot = (eventId: number) => useWrite(eventId, (slotId: number) => api.deleteSlot(eventId, slotId));
