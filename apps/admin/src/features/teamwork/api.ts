import { api } from "@moa/app-kit";

import { nullIfAhead } from "@/lib/ahead-of-api";

import {
  badgeSchema,
  deskSettingsSchema,
  eligibleAdminsSchema,
  followUpDoneSchema,
  followUpSchema,
  helpAnswerSchema,
  helpAnswersSchema,
  lostReasonSchema,
  lostReasonsSchema,
  myDaySchema,
  publicTopicsSchema,
  reportsSchema,
  savedReplySchema,
  savedRepliesSchema,
  teamsSchema,
  topicSchema,
  topicsSchema,
  type DeskSettings,
  type FollowUpInput,
  type HelpAnswer,
  type SavedReply,
  type TeamKey,
  type Topic,
} from "./schemas";

export const ADMIN = "/api/v1/admin";
export const BADGE_PATH = `${ADMIN}/teamwork/badge`;

/**
 * The side menu's counts, and the probe for the whole of Team work: `null`
 * on an API from before it (a bare 404 or 405), and the menu group hides.
 */
export async function fetchBadge() {
  return nullIfAhead(async () => badgeSchema.parse(await api.get<unknown>(BADGE_PATH)));
}

// --- teams -----------------------------------------------------------------------------------------

export async function fetchTeams() {
  return teamsSchema.parse(await api.get<unknown>(`${ADMIN}/teams`));
}

/** Owner only: the admin accounts that may be put in a team. */
export async function fetchEligibleAdmins() {
  return eligibleAdminsSchema.parse(await api.get<unknown>(`${ADMIN}/teams/eligible`));
}

/** Owner only: the whole membership of one team, replaced. */
export async function setTeamMembers(key: TeamKey, userIds: number[]) {
  return api.put<unknown>(`${ADMIN}/teams/${key}/members`, { user_ids: userIds });
}

/** Any team member: away (their new cases skip them), until a date or until they say so. */
export async function setAway(away: boolean, awayUntil: string | null) {
  return api.patch<unknown>(`${ADMIN}/teams/me`, { away, away_until: away ? awayUntil : null });
}

// --- follow-ups ------------------------------------------------------------------------------------

export async function createFollowUp(input: FollowUpInput) {
  return followUpSchema.parse(await api.post<unknown>(`${ADMIN}/follow-ups`, input));
}

/** Marks a follow-up done; `needsNext` says its lead now has none open. */
export async function completeFollowUp(id: number) {
  return followUpDoneSchema.parse(await api.patch<unknown>(`${ADMIN}/follow-ups/${id}`, { done: true }));
}

export async function moveFollowUp(id: number, dueAt: string) {
  return api.patch<unknown>(`${ADMIN}/follow-ups/${id}`, { due_at: dueAt });
}

// --- my day and reports ----------------------------------------------------------------------------

export async function fetchMyDay() {
  return myDaySchema.parse(await api.get<unknown>(`${ADMIN}/teamwork/my-day`));
}

export interface ReportRange {
  from: string;
  to: string;
}

export async function fetchReports(range: ReportRange) {
  return reportsSchema.parse(await api.get<unknown>(`${ADMIN}/teamwork/reports`, { query: { from: range.from, to: range.to } }));
}

/** The reports workbook, through the gateway (the session cookie goes with it). */
export function reportsExportUrl(range: ReportRange): string {
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  return `/api/gateway${ADMIN}/teamwork/reports?${qs.toString()}`;
}

// --- desk settings ---------------------------------------------------------------------------------

/** The topics everyone may pick from (account, tickets, payments…): the filters and the forms. */
export async function fetchPublicTopics() {
  return publicTopicsSchema.parse(await api.get<unknown>("/api/v1/support/topics"));
}

export async function fetchTopics() {
  return topicsSchema.parse(await api.get<unknown>(`${ADMIN}/support/topics`));
}

export type TopicInput = Pick<Topic, "key" | "label" | "assign" | "default_priority"> & { assignee_id: number | null };

export async function saveTopic(input: TopicInput, existingKey?: string) {
  const raw = existingKey ? await api.patch<unknown>(`${ADMIN}/support/topics/${encodeURIComponent(existingKey)}`, input) : await api.post<unknown>(`${ADMIN}/support/topics`, input);
  return topicSchema.safeParse(raw).data ?? null;
}

export async function deleteTopic(key: string) {
  await api.del<unknown>(`${ADMIN}/support/topics/${encodeURIComponent(key)}`);
}

export async function fetchSavedReplies() {
  return savedRepliesSchema.parse(await api.get<unknown>(`${ADMIN}/support/saved-replies`));
}

export type SavedReplyInput = Omit<SavedReply, "id">;

export async function saveSavedReply(input: SavedReplyInput, id?: number) {
  const raw = id ? await api.patch<unknown>(`${ADMIN}/support/saved-replies/${id}`, input) : await api.post<unknown>(`${ADMIN}/support/saved-replies`, input);
  return savedReplySchema.safeParse(raw).data ?? null;
}

export async function deleteSavedReply(id: number) {
  await api.del<unknown>(`${ADMIN}/support/saved-replies/${id}`);
}

export async function fetchHelpAnswers() {
  return helpAnswersSchema.parse(await api.get<unknown>(`${ADMIN}/support/help-answers`));
}

export type HelpAnswerInput = Omit<HelpAnswer, "id">;

export async function saveHelpAnswer(input: HelpAnswerInput, id?: number) {
  const raw = id ? await api.patch<unknown>(`${ADMIN}/support/help-answers/${id}`, input) : await api.post<unknown>(`${ADMIN}/support/help-answers`, input);
  return helpAnswerSchema.safeParse(raw).data ?? null;
}

export async function deleteHelpAnswer(id: number) {
  await api.del<unknown>(`${ADMIN}/support/help-answers/${id}`);
}

export async function fetchLostReasons() {
  return lostReasonsSchema.parse(await api.get<unknown>(`${ADMIN}/leads/lost-reasons`));
}

export async function saveLostReason(label: string, id?: number) {
  const raw = id ? await api.patch<unknown>(`${ADMIN}/leads/lost-reasons/${id}`, { label }) : await api.post<unknown>(`${ADMIN}/leads/lost-reasons`, { label });
  return lostReasonSchema.safeParse(raw).data ?? null;
}

export async function deleteLostReason(id: number) {
  await api.del<unknown>(`${ADMIN}/leads/lost-reasons/${id}`);
}

export async function fetchDeskSettings() {
  return deskSettingsSchema.parse(await api.get<unknown>(`${ADMIN}/support/settings`));
}

export async function saveDeskSettings(input: DeskSettings) {
  return deskSettingsSchema.parse(await api.put<unknown>(`${ADMIN}/support/settings`, input));
}
