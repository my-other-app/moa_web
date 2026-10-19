import { api } from "@moa/app-kit";
import { z } from "zod";

import {
  feedbackSchema,
  hostActionSchema,
  hostStateSchema,
  pollSchema,
  pollStatusSchema,
  qaBoardSchema,
  questionSchema,
  quizQuestionSchema,
  quizSchema,
  screenSchema,
  shiftOutSchema,
  surveySchema,
  updateSchema,
  updatesPageSchema,
  type HostAction,
  type LiveUpdate,
  type ModerateAction,
  type Poll,
  type SurveyQuestion,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/live`;

// --- quiz ----------------------------------------------------------------------

export async function fetchQuiz(eventId: number) {
  return quizSchema.parse(await api.get<unknown>(`${base(eventId)}/quiz`));
}

export async function patchQuiz(eventId: number, patch: { title?: string; intro?: string | null }) {
  return quizSchema.parse(await api.patch<unknown>(`${base(eventId)}/quiz`, patch));
}

export type QuizQuestionBody = { prompt: string; options: { key: string; label: string }[]; correct_key: string; seconds: number };

export async function addQuizQuestion(eventId: number, body: QuizQuestionBody) {
  return quizQuestionSchema.parse(await api.post<unknown>(`${base(eventId)}/quiz/questions`, body));
}

export async function patchQuizQuestion(eventId: number, id: string, patch: Partial<QuizQuestionBody>) {
  return quizQuestionSchema.parse(await api.patch<unknown>(`${base(eventId)}/quiz/questions/${id}`, patch));
}

export async function deleteQuizQuestion(eventId: number, id: string) {
  await api.del<unknown>(`${base(eventId)}/quiz/questions/${id}`);
}

export async function fetchHostState(eventId: number) {
  return hostStateSchema.parse(await api.get<unknown>(`${base(eventId)}/quiz/host`));
}

/**
 * A start says whether to notify the room; the other moves send `{}` as they
 * always have. Servers from before notifying the room take no body here and
 * ignore it, so the same request is safe against either.
 */
export async function hostAction(eventId: number, action: HostAction, notify?: boolean) {
  const body = action === "start" && notify !== undefined ? { notify } : {};
  return hostActionSchema.parse(await api.post<unknown>(`${base(eventId)}/quiz/host/${action}`, body));
}

// --- Q&A ----------------------------------------------------------------------

export async function fetchQuestions(eventId: number) {
  return qaBoardSchema.parse(await api.get<unknown>(`${base(eventId)}/questions`));
}

export async function setApproveFirst(eventId: number, approve_first: boolean) {
  return qaBoardSchema.parse(await api.patch<unknown>(`${base(eventId)}/questions/settings`, { approve_first }));
}

export async function moderateQuestion(eventId: number, id: string, action: ModerateAction) {
  return questionSchema.parse(await api.post<unknown>(`${base(eventId)}/questions/${id}`, { action }));
}

// --- polls ----------------------------------------------------------------------

export async function fetchPolls(eventId: number) {
  return z.array(pollSchema).parse(await api.get<unknown>(`${base(eventId)}/polls`));
}

export async function createPoll(eventId: number, body: { kind: Poll["kind"]; prompt: string; options: string[] }) {
  return pollSchema.parse(await api.post<unknown>(`${base(eventId)}/polls`, body));
}

/**
 * A launch says whether to notify the room; a close sends `{ status }` alone.
 * Servers from before notifying the room drop fields they do not know from
 * this body, so `notify` is safe against either.
 */
export async function setPollStatus(eventId: number, id: string, status: "live" | "closed", notify?: boolean) {
  const body = status === "live" && notify !== undefined ? { status, notify } : { status };
  return pollStatusSchema.parse(await api.post<unknown>(`${base(eventId)}/polls/${id}/status`, body));
}

export async function deletePoll(eventId: number, id: string) {
  await api.del<unknown>(`${base(eventId)}/polls/${id}`);
}

// --- feedback ----------------------------------------------------------------------

export async function fetchFeedback(eventId: number) {
  return feedbackSchema.parse(await api.get<unknown>(`${base(eventId)}/feedback`));
}

export async function putSurvey(eventId: number, patch: { auto_send?: boolean; delay_minutes?: number; questions?: SurveyQuestion[] }) {
  return surveySchema.parse(await api.put<unknown>(`${base(eventId)}/feedback`, patch));
}

export async function sendSurveyNow(eventId: number) {
  return surveySchema.extend({ sent: z.number(), invited: z.number() }).parse(await api.post<unknown>(`${base(eventId)}/feedback/send`, {}));
}

// --- updates ----------------------------------------------------------------------

export async function fetchUpdates(eventId: number) {
  return updatesPageSchema.parse(await api.get<unknown>(`${base(eventId)}/updates`));
}

export async function pushUpdate(eventId: number, body: { kind: LiveUpdate["kind"]; text: string; audience: LiveUpdate["audience"] }) {
  return updateSchema.parse(await api.post<unknown>(`${base(eventId)}/updates`, body));
}

export async function shiftSchedule(eventId: number, item_id: string, minutes: number) {
  return shiftOutSchema.parse(await api.post<unknown>(`${base(eventId)}/schedule/shift`, { item_id, minutes }));
}

// --- the screen ----------------------------------------------------------------------

export async function fetchScreen(eventId: number) {
  return screenSchema.parse(await api.get<unknown>(`${base(eventId)}/screen`));
}
