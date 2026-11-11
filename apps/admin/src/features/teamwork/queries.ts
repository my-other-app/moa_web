"use client";

import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@moa/app-kit";
import { roleOf } from "@moa/auth";
import { toast } from "@moa/ui";

import {
  completeFollowUp,
  createFollowUp,
  deleteHelpAnswer,
  deleteLostReason,
  deleteSavedReply,
  deleteTopic,
  fetchBadge,
  fetchDeskSettings,
  fetchEligibleAdmins,
  fetchHelpAnswers,
  fetchLostReasons,
  fetchMyDay,
  fetchPublicTopics,
  fetchReports,
  fetchSavedReplies,
  fetchTeams,
  fetchTopics,
  saveDeskSettings,
  saveHelpAnswer,
  saveLostReason,
  saveSavedReply,
  saveTopic,
  setAway,
  setTeamMembers,
  type HelpAnswerInput,
  type ReportRange,
  type SavedReplyInput,
  type TopicInput,
} from "./api";
import { teamRights, type DeskSettings, type FollowUpInput, type TeamKey, type TeamRights } from "./schemas";

/** Everything Team work reads, so one change refreshes the badge, My day and the lists. */
export const TEAMWORK_KEY = ["admin", "teamwork"] as const;
const key = (...rest: unknown[]) => [...TEAMWORK_KEY, ...rest] as const;

/** How often the side menu asks for its counts: the minute the reports count keeps. */
export const BADGE_POLL_MS = 60_000;

/** The side menu's counts, or `null` on an API without Team work (the group then hides). */
export function useTeamworkBadge() {
  return useQuery({
    queryKey: key("badge"),
    queryFn: fetchBadge,
    refetchInterval: BADGE_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: BADGE_POLL_MS / 2,
    retry: false,
  });
}

/** Whether the API has Team work: true, false, or undefined while asked. A failing probe hides it. */
export function useTeamworkOnServer(): boolean | undefined {
  const q = useTeamworkBadge();
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

export function useTeams() {
  return useQuery({ queryKey: key("teams"), queryFn: fetchTeams, staleTime: 60_000 });
}

/** The signed-in admin's desk rights: their role, and the teams GET /admin/teams puts them in. */
export function useTeamRights(): TeamRights & { isPending: boolean } {
  const { data: user } = useSession();
  const teams = useTeams();
  const meId = user?.id ?? null;
  const role = roleOf(user ?? null);
  return React.useMemo(() => ({ ...teamRights({ meId, role, teams: teams.data }), isPending: teams.isPending }), [meId, role, teams.data, teams.isPending]);
}

export function useEligibleAdmins(enabled: boolean) {
  return useQuery({ queryKey: key("eligible"), queryFn: fetchEligibleAdmins, enabled, staleTime: 60_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TEAMWORK_KEY });
}

const failed = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

export function useSetTeamMembers() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ team, userIds }: { team: TeamKey; userIds: number[] }) => setTeamMembers(team, userIds),
    onSuccess: async () => {
      toast.success("Team saved");
      await refresh();
    },
    onError: failed("Could not save the team"),
  });
}

export function useSetAway() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ away, until }: { away: boolean; until: string | null }) => setAway(away, until),
    onSuccess: async (_, { away }) => {
      toast.success(away ? "You're marked away: new cases skip you" : "Welcome back: new cases reach you again");
      await refresh();
    },
    onError: failed("Could not change your away status"),
  });
}

export function useCreateFollowUp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: FollowUpInput) => createFollowUp(input),
    onSuccess: async () => {
      toast.success("Follow-up set");
      await refresh();
    },
    onError: failed("Could not set the follow-up"),
  });
}

export function useCompleteFollowUp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => completeFollowUp(id),
    onSuccess: async () => {
      toast.success("Done");
      await refresh();
    },
    onError: failed("Could not mark it done"),
  });
}

export function useMyDay() {
  return useQuery({ queryKey: key("my-day"), queryFn: fetchMyDay, refetchInterval: BADGE_POLL_MS });
}

export function useTeamworkReports(range: ReportRange) {
  return useQuery({ queryKey: key("reports", range), queryFn: () => fetchReports(range), placeholderData: keepPreviousData });
}

// --- desk settings ---------------------------------------------------------------------------------

/** The topics as everyone sees them; shared by the filters and the forms. */
export function usePublicTopics() {
  return useQuery({ queryKey: key("public-topics"), queryFn: fetchPublicTopics, staleTime: 5 * 60_000 });
}

export function useTopics(enabled = true) {
  return useQuery({ queryKey: key("topics"), queryFn: fetchTopics, enabled });
}

export function useSavedReplies(enabled = true) {
  return useQuery({ queryKey: key("saved-replies"), queryFn: fetchSavedReplies, enabled, retry: false });
}

export function useHelpAnswers(enabled = true) {
  return useQuery({ queryKey: key("help-answers"), queryFn: fetchHelpAnswers, enabled });
}

export function useLostReasons(enabled = true) {
  return useQuery({ queryKey: key("lost-reasons"), queryFn: fetchLostReasons, enabled, staleTime: 5 * 60_000 });
}

export function useDeskSettings(enabled = true) {
  return useQuery({ queryKey: key("desk-settings"), queryFn: fetchDeskSettings, enabled });
}

function useSave<I>(fn: (input: I) => Promise<unknown>, done: string, fallback: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      toast.success(done);
      await refresh();
    },
    onError: failed(fallback),
  });
}

export const useSaveTopic = () => useSave(({ input, existingKey }: { input: TopicInput; existingKey?: string }) => saveTopic(input, existingKey), "Topic saved", "Could not save the topic");
export const useDeleteTopic = () => useSave((k: string) => deleteTopic(k), "Topic removed", "Could not remove the topic");
export const useSaveSavedReply = () => useSave(({ input, id }: { input: SavedReplyInput; id?: number }) => saveSavedReply(input, id), "Saved reply saved", "Could not save the reply");
export const useDeleteSavedReply = () => useSave((id: number) => deleteSavedReply(id), "Saved reply removed", "Could not remove the reply");
export const useSaveHelpAnswer = () => useSave(({ input, id }: { input: HelpAnswerInput; id?: number }) => saveHelpAnswer(input, id), "Answer saved", "Could not save the answer");
export const useDeleteHelpAnswer = () => useSave((id: number) => deleteHelpAnswer(id), "Answer removed", "Could not remove the answer");
export const useSaveLostReason = () => useSave(({ label, id }: { label: string; id?: number }) => saveLostReason(label, id), "Reason saved", "Could not save the reason");
export const useDeleteLostReason = () => useSave((id: number) => deleteLostReason(id), "Reason removed", "Could not remove the reason");
export const useSaveDeskSettings = () => useSave((input: DeskSettings) => saveDeskSettings(input), "Desk settings saved", "Could not save the settings");
