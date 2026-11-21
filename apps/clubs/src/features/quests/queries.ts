"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";

import { toastError } from "@/features/plan/errors";

import {
  addReward,
  createMilestone,
  createStation,
  createTask,
  deleteMilestone,
  deleteReward,
  deleteTask,
  fetchAudit,
  fetchDashboard,
  fetchGuest,
  fetchGuests,
  fetchLeaderboard,
  fetchQuestAdmin,
  fetchTemplates,
  grantTask,
  orderTasks,
  recompute,
  reofferReward,
  revokeTask,
  saveQuest,
  updateMilestone,
  updateReward,
  updateTask,
  type StationInput,
} from "./api";
import type { GuestQuery, QuestSettingsPatch, SoldOutMode, TaskInput } from "./schemas";

const root = (eventId: number) => [...qk.events.detail(eventId), "quests"] as const;
export const questAdminKey = (eventId: number) => [...root(eventId), "admin"] as const;
export const questTemplatesKey = (eventId: number) => [...root(eventId), "templates"] as const;
const dashboardKey = (eventId: number) => [...root(eventId), "dashboard"] as const;
const guestsKey = (eventId: number) => [...root(eventId), "guests"] as const;
const auditKey = (eventId: number) => [...root(eventId), "audit"] as const;

/**
 * The task templates: static, cheap and without side effects, so the event
 * console asks for them to know whether the API has quests at all (null
 * from one without, and the tab stays away). Reading the quest itself makes
 * its row, so that waits until the Quests tab is opened.
 */
export function useQuestTemplates(eventId: number) {
  return useQuery({
    queryKey: questTemplatesKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchTemplates(eventId)),
    enabled: eventId > 0,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useQuestAdmin(eventId: number) {
  return useQuery({
    queryKey: questAdminKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchQuestAdmin(eventId)),
    enabled: eventId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

/** Everything an organiser change can move: the quest, its numbers, its guests, the audit. */
function useRefresh(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: root(eventId) });
}

export function useSaveQuest(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: QuestSettingsPatch) => saveQuest(eventId, patch),
    onSuccess: (data) => {
      qc.setQueryData(questAdminKey(eventId), data);
      void qc.invalidateQueries({ queryKey: dashboardKey(eventId) });
      void qc.invalidateQueries({ queryKey: guestsKey(eventId) });
    },
  });
}

export function useCreateTask(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: TaskInput) => createTask(eventId, body), onSuccess: refresh });
}

export function useUpdateTask(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Partial<Omit<TaskInput, "kind">> }) => updateTask(eventId, taskId, body),
    onSuccess: refresh,
  });
}

export function useDeleteTask(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (taskId: string) => deleteTask(eventId, taskId), onSuccess: refresh, onError: toastError });
}

export function useOrderTasks(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (ids: string[]) => orderTasks(eventId, ids), onSuccess: refresh, onError: toastError });
}

export function useCreateMilestone(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (body: { title: string; threshold: number }) => createMilestone(eventId, body), onSuccess: refresh, onError: toastError });
}

export function useUpdateMilestone(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ milestoneId, body }: { milestoneId: string; body: { title?: string; threshold?: number; sort_order?: number } }) => updateMilestone(eventId, milestoneId, body),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useDeleteMilestone(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (milestoneId: string) => deleteMilestone(eventId, milestoneId), onSuccess: refresh, onError: toastError });
}

export function useAddReward(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ milestoneId, body }: { milestoneId: string; body: { merch_item_id: string; sold_out_mode: SoldOutMode } }) => addReward(eventId, milestoneId, body),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useUpdateReward(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ rewardId, mode }: { rewardId: string; mode: SoldOutMode }) => updateReward(eventId, rewardId, { sold_out_mode: mode }),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useDeleteReward(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (rewardId: string) => deleteReward(eventId, rewardId), onSuccess: refresh, onError: toastError });
}

export function useReofferReward(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: (rewardId: string) => reofferReward(eventId, rewardId), onSuccess: refresh, onError: toastError });
}

export function useCreateStation(eventId: number) {
  const qc = useQueryClient();
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (body: StationInput) => createStation(eventId, body),
    onSuccess: () => {
      refresh();
      // The new door is on the Doors tab too.
      void qc.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "team"] });
    },
  });
}

/** Fifteen seconds: the event day's numbers, cheap to read again (§9.2). */
export const DASHBOARD_MS = 15_000;

export function useQuestDashboard(eventId: number, enabled = true) {
  return useQuery({
    queryKey: dashboardKey(eventId),
    queryFn: () => fetchDashboard(eventId),
    enabled: enabled && eventId > 0,
    staleTime: DASHBOARD_MS / 2,
    refetchInterval: DASHBOARD_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useQuestLeaderboard(eventId: number, enabled: boolean) {
  return useQuery({
    queryKey: [...dashboardKey(eventId), "leaderboard"],
    queryFn: () => fetchLeaderboard(eventId, 10),
    enabled: enabled && eventId > 0,
    staleTime: DASHBOARD_MS / 2,
    refetchInterval: DASHBOARD_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useQuestGuests(eventId: number, q: GuestQuery, enabled = true) {
  return useQuery({
    queryKey: [...guestsKey(eventId), q],
    queryFn: () => fetchGuests(eventId, q),
    enabled: enabled && eventId > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useQuestGuest(eventId: number, registrationId: string | null) {
  return useQuery({
    queryKey: [...guestsKey(eventId), "one", registrationId ?? ""],
    queryFn: () => fetchGuest(eventId, registrationId as string),
    enabled: !!registrationId,
    staleTime: 5_000,
  });
}

/** Grant or revoke one task for one guest; the answer is their view, straight into the cache. */
export function useGrantRevoke(eventId: number, registrationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, grant, note }: { taskId: string; grant: boolean; note: string | null }) =>
      (grant ? grantTask : revokeTask)(eventId, registrationId, taskId, note),
    onSuccess: (view) => {
      qc.setQueryData([...guestsKey(eventId), "one", registrationId], view);
      void qc.invalidateQueries({ queryKey: [...guestsKey(eventId)], predicate: (q) => q.queryKey[q.queryKey.length - 2] !== "one" });
      void qc.invalidateQueries({ queryKey: dashboardKey(eventId) });
      void qc.invalidateQueries({ queryKey: auditKey(eventId) });
      void qc.invalidateQueries({ queryKey: questAdminKey(eventId) });
    },
  });
}

export function useQuestAudit(eventId: number, page: number, enabled = true) {
  return useQuery({
    queryKey: [...auditKey(eventId), page],
    queryFn: () => fetchAudit(eventId, page),
    enabled: enabled && eventId > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useRecompute(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({ mutationFn: () => recompute(eventId), onSuccess: refresh, onError: toastError });
}
