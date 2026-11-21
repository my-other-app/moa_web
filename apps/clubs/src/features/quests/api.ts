import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import { z } from "zod";

import { doorSchema, linkSchema } from "@/features/doors/schemas";

import {
  auditListSchema,
  dashboardSchema,
  guestListSchema,
  guestViewSchema,
  leaderboardSchema,
  milestoneSchema,
  questAdminSchema,
  rewardSchema,
  taskSchema,
  templatesSchema,
  type GuestQuery,
  type QuestSettingsPatch,
  type SoldOutMode,
  type TaskInput,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/quests`;
const id = encodeURIComponent;

/** The quest with its tasks, milestones, stations and swag (made, switched off, on the first read). */
export async function fetchQuestAdmin(eventId: number) {
  return questAdminSchema.parse(await api.get<unknown>(base(eventId)));
}

/** Change any of the settings; answers the whole quest. Switching it on queues a recompute. */
export async function saveQuest(eventId: number, patch: QuestSettingsPatch) {
  return questAdminSchema.parse(await api.patch<unknown>(base(eventId), patch));
}

/** Every task kind with its label, default title and rule fields: the "add a task" picker. */
export async function fetchTemplates(eventId: number) {
  return templatesSchema.parse(await api.get<unknown>(`${base(eventId)}/templates`));
}

export async function createTask(eventId: number, body: TaskInput) {
  return taskSchema.parse(await api.post<unknown>(`${base(eventId)}/tasks`, body));
}

export async function updateTask(eventId: number, taskId: string, body: Partial<Omit<TaskInput, "kind">>) {
  return taskSchema.parse(await api.patch<unknown>(`${base(eventId)}/tasks/${id(taskId)}`, body));
}

export async function deleteTask(eventId: number, taskId: string) {
  await api.del<unknown>(`${base(eventId)}/tasks/${id(taskId)}`);
}

export async function orderTasks(eventId: number, ids: string[]) {
  return z.array(taskSchema).catch([]).parse(await api.put<unknown>(`${base(eventId)}/tasks/order`, { ids }));
}

export async function createMilestone(eventId: number, body: { title: string; threshold: number }) {
  return milestoneSchema.parse(await api.post<unknown>(`${base(eventId)}/milestones`, body));
}

export async function updateMilestone(eventId: number, milestoneId: string, body: { title?: string; threshold?: number; sort_order?: number }) {
  return milestoneSchema.parse(await api.patch<unknown>(`${base(eventId)}/milestones/${id(milestoneId)}`, body));
}

export async function deleteMilestone(eventId: number, milestoneId: string) {
  await api.del<unknown>(`${base(eventId)}/milestones/${id(milestoneId)}`);
}

export async function addReward(eventId: number, milestoneId: string, body: { merch_item_id: string; sold_out_mode: SoldOutMode }) {
  return rewardSchema.parse(await api.post<unknown>(`${base(eventId)}/milestones/${id(milestoneId)}/rewards`, body));
}

export async function updateReward(eventId: number, rewardId: string, body: { sold_out_mode: SoldOutMode }) {
  return rewardSchema.parse(await api.patch<unknown>(`${base(eventId)}/rewards/${id(rewardId)}`, body));
}

export async function deleteReward(eventId: number, rewardId: string) {
  await api.del<unknown>(`${base(eventId)}/rewards/${id(rewardId)}`);
}

/** Hold freed units for guests whose reward was sold out when they unlocked it, in unlock order. */
export async function reofferReward(eventId: number, rewardId: string) {
  return z
    .object({ held: z.number().catch(0), still_sold_out: z.number().catch(0) })
    .parse(await api.post<unknown>(`${base(eventId)}/rewards/${id(rewardId)}/reoffer`, {}));
}

export interface StationInput {
  name: string;
  purpose: "station" | "swag_desk";
  task?: { title: string; points?: number; required?: boolean };
  link?: { days?: number };
}

/** A station or swag desk: the door, its station task, and its door link (shown once). */
export async function createStation(eventId: number, body: StationInput) {
  return z
    .object({
      door: doorSchema.partial({ volunteers: true, check_ins: true, sort_order: true, event_id: true, link: true }).passthrough(),
      link: linkSchema.nullish().catch(null),
      task: taskSchema.nullish().catch(null),
    })
    .parse(await api.post<unknown>(`${base(eventId)}/stations`, body));
}

/** People per task and milestone, unlocked against collected, stock left, station visits. */
export async function fetchDashboard(eventId: number) {
  return dashboardSchema.parse(await api.get<unknown>(`${base(eventId)}/dashboard`));
}

/** The club's leaderboard (full names): always there, whether or not guests see one. */
export async function fetchLeaderboard(eventId: number, limit = 10) {
  return leaderboardSchema.parse(await api.get<unknown>(`${base(eventId)}/leaderboard`, { query: { limit } }));
}

export async function fetchGuests(eventId: number, q: GuestQuery) {
  return guestListSchema.parse(
    await api.get<unknown>(`${base(eventId)}/guests`, {
      query: { q: q.q || undefined, milestone_id: q.milestoneId, task_id: q.taskId, claim_status: q.claimStatus, sort: q.sort, page: q.page, page_size: q.pageSize },
    })
  );
}

export async function fetchGuest(eventId: number, registrationId: string) {
  return guestViewSchema.parse(await api.get<unknown>(`${base(eventId)}/guests/${id(registrationId)}`));
}

/** Tick a task for a guest by hand (the only way for "marked done by you" tasks), with why: audited. */
export async function grantTask(eventId: number, registrationId: string, taskId: string, note: string | null) {
  return guestViewSchema.parse(await api.post<unknown>(`${base(eventId)}/guests/${id(registrationId)}/tasks/${id(taskId)}/grant`, { note }));
}

/** Take a tick back, with why: audited; it stays revoked until granted again. */
export async function revokeTask(eventId: number, registrationId: string, taskId: string, note: string | null) {
  return guestViewSchema.parse(await api.post<unknown>(`${base(eventId)}/guests/${id(registrationId)}/tasks/${id(taskId)}/revoke`, { note }));
}

export async function fetchAudit(eventId: number, page: number) {
  return auditListSchema.parse(await api.get<unknown>(`${base(eventId)}/audit`, { query: { page } }));
}

/** Run every rule again for every guest (safe to repeat). */
export async function recompute(eventId: number) {
  return z.object({ queued: z.boolean().catch(true) }).catch({ queued: true }).parse(await api.post<unknown>(`${base(eventId)}/recompute`, {}));
}

/** Who earned what, one row per guest: the export menu adds the format. */
export const questExportUrl = (eventId: number) => `${GATEWAY_PREFIX}${base(eventId)}/export`;
