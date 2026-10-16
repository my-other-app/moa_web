import { api } from "@moa/app-kit";

import { competitionSchema, type Competition, type SettingsPatch, type Stage } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/competition`;
const parse = (raw: unknown): Competition => competitionSchema.parse(raw);

export const fetchCompetition = async (eventId: number) => parse(await api.get<unknown>(base(eventId)));
export const patchSettings = async (eventId: number, patch: SettingsPatch) => parse(await api.patch<unknown>(base(eventId), patch));

export type TrackBody = { name: string; description?: string | null; sponsor?: string | null; prize?: string | null };
export const addTrack = async (eventId: number, body: TrackBody) => parse(await api.post<unknown>(`${base(eventId)}/tracks`, body));
export const patchTrack = async (eventId: number, id: number, body: Partial<TrackBody> & { sort_order?: number }) => parse(await api.patch<unknown>(`${base(eventId)}/tracks/${id}`, body));
export const deleteTrack = async (eventId: number, id: number) => parse(await api.del<unknown>(`${base(eventId)}/tracks/${id}`));

export const createTeam = async (eventId: number, body: { name: string; track_id?: number | null; registration_ids?: string[] }) => parse(await api.post<unknown>(`${base(eventId)}/teams`, body));
export const patchTeam = async (eventId: number, id: number, body: { name?: string; track_id?: number | null; stage?: Stage }) => parse(await api.patch<unknown>(`${base(eventId)}/teams/${id}`, body));
export const deleteTeam = async (eventId: number, id: number) => parse(await api.del<unknown>(`${base(eventId)}/teams/${id}`));
export const addMember = async (eventId: number, teamId: number, registrationId: string) => parse(await api.post<unknown>(`${base(eventId)}/teams/${teamId}/members`, { registration_id: registrationId }));
export const removeMember = async (eventId: number, teamId: number, registrationId: string) => parse(await api.del<unknown>(`${base(eventId)}/teams/${teamId}/members/${registrationId}`));

export const submissionsAction = async (eventId: number, action: "close" | "reopen") => parse(await api.post<unknown>(`${base(eventId)}/submissions/${action}`, {}));

export const addJudge = async (eventId: number, body: { name: string; email?: string | null }) => parse(await api.post<unknown>(`${base(eventId)}/judges`, body));
export const deleteJudge = async (eventId: number, id: number) => parse(await api.del<unknown>(`${base(eventId)}/judges/${id}`));
export const putScore = async (eventId: number, judgeId: number, teamId: number, scores: Record<string, number>, note?: string | null) => parse(await api.put<unknown>(`${base(eventId)}/judges/${judgeId}/scores/${teamId}`, { scores, note: note ?? null }));

export const advance = async (eventId: number, to: "shortlisted" | "finalist", size?: number) => parse(await api.post<unknown>(`${base(eventId)}/rounds/advance`, { to, size }));

export const addMentor = async (eventId: number, body: { name: string; topic?: string | null }) => parse(await api.post<unknown>(`${base(eventId)}/mentors`, body));
export const deleteMentor = async (eventId: number, id: number) => parse(await api.del<unknown>(`${base(eventId)}/mentors/${id}`));
export const makeSlots = async (eventId: number, mentorId: number, startsAt: string, endsAt: string) => parse(await api.post<unknown>(`${base(eventId)}/mentors/${mentorId}/slots`, { starts_at: startsAt, ends_at: endsAt }));
export const setSlot = async (eventId: number, slotId: number, teamId: number | null) => parse(await api.patch<unknown>(`${base(eventId)}/slots/${slotId}`, { team_id: teamId }));
export const deleteSlot = async (eventId: number, slotId: number) => parse(await api.del<unknown>(`${base(eventId)}/slots/${slotId}`));
