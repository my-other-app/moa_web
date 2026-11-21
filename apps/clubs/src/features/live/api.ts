import { api } from "@moa/app-kit";
import type { RequestOptions } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";
import { z } from "zod";

import {
  feedbackSchema,
  hostActionSchema,
  hostStateSchema,
  mediaSchema,
  markOutSchema,
  moderateSchema,
  overallRowSchema,
  pollResponseSchema,
  pollSchema,
  pollStatusSchema,
  qaBoardSchema,
  qaSettingsSchema,
  quizQuestionSchema,
  quizSchema,
  roundSummarySchema,
  screenControlSchema,
  screenSchema,
  shiftOutSchema,
  surveySchema,
  themeCheckSchema,
  themeOutSchema,
  themePresetSchema,
  updateSchema,
  updatesPageSchema,
  winnerSchema,
  type HostAction,
  type LiveUpdate,
  type ModerateAction,
  type PollKind,
  type PollSettings,
  type QuestionKind,
  type QuizOption,
  type QuizSettings,
  type ScreenControl,
  type SurveyQuestion,
} from "./schemas";
import type { ThemeDraft } from "./theme";

const base = (eventId: number) => `/api/v1/events/${eventId}/live`;

/**
 * Every live call says it is this release's console (CONTRACT 0.3): the club
 * endpoints that exist today answer a request without it with exactly
 * today's fields, so a console tab left open across the deploy sees no
 * change -- and this one, which knows rounds, kinds and the theme, gets them.
 */
export const LIVE_VERSION = { "X-Live-Version": "2" } as const;
const v2: RequestOptions = { headers: LIVE_VERSION };

const get = <T = unknown>(path: string, o: RequestOptions = {}) => api.get<T>(path, { ...v2, ...o });
const post = <T = unknown>(path: string, body?: unknown) => api.post<T>(path, body, v2);
const patch = <T = unknown>(path: string, body?: unknown) => api.patch<T>(path, body, v2);
const put = <T = unknown>(path: string, body?: unknown) => api.put<T>(path, body, v2);
const del = <T = unknown>(path: string, body?: unknown) => api.del<T>(path, body, v2);

// --- quiz (the event's current round) ----------------------------------------------------------------------

/** The event's current round (the live one; else the last ended; else the first), made on first read as today. */
export async function fetchQuiz(eventId: number) {
  return quizSchema.parse(await get(`${base(eventId)}/quiz`));
}

export async function patchQuiz(eventId: number, change: { title?: string; intro?: string | null }) {
  return quizSchema.parse(await patch(`${base(eventId)}/quiz`, change));
}

/** A question as the editor sends it: today's four fields, then the kind's own and the overrides. */
export type QuizQuestionBody = {
  prompt: string;
  options: QuizOption[];
  correct_key?: string | null;
  seconds: number;
  kind?: QuestionKind;
  correct_keys?: string[];
  multi_rule?: "all" | "proportional" | "subtract";
  accepted?: string[];
  match?: "exact" | "close";
  order_rule?: "all" | "partial";
  points?: number | null;
  double?: boolean;
};

export async function addQuizQuestion(eventId: number, body: QuizQuestionBody) {
  return quizQuestionSchema.parse(await post(`${base(eventId)}/quiz/questions`, body));
}

export async function patchQuizQuestion(eventId: number, id: string, change: Partial<QuizQuestionBody>) {
  return quizQuestionSchema.parse(await patch(`${base(eventId)}/quiz/questions/${encodeURIComponent(id)}`, change));
}

export async function deleteQuizQuestion(eventId: number, id: string) {
  await del(`${base(eventId)}/quiz/questions/${encodeURIComponent(id)}`);
}

export async function fetchHostState(eventId: number) {
  return hostStateSchema.parse(await get(`${base(eventId)}/quiz/host`));
}

export type HostOptions = {
  /** start: tell the room. */
  notify?: boolean;
  /** start: start again a quiz that is running (it clears every score); without it the server answers 409 QUIZ_RUNNING. */
  restart?: boolean;
  /** next: the question the console shows; the server answers 409 QUIZ_MOVED_ON when the quiz is no longer on it. */
  expectedIndex?: number;
  /** reopen: the question to ask again (the current one when not given). */
  index?: number;
};

/**
 * A start says whether to notify the room (and, confirmed, to restart a
 * running quiz); a next says which question it moves on from; a reopen
 * which question to ask again; the rest send `{}` as they always have.
 * Servers from before drop fields they do not know, so the same request is
 * safe against either.
 */
function hostBody(action: HostAction, opts: HostOptions) {
  const body: Record<string, unknown> = {};
  if (action === "start" && opts.notify !== undefined) body.notify = opts.notify;
  if (action === "start" && opts.restart) body.restart = true;
  if (action === "next" && opts.expectedIndex !== undefined) body.expected_index = opts.expectedIndex;
  if (action === "reopen" && opts.index !== undefined) body.index = opts.index;
  return body;
}

export async function hostAction(eventId: number, action: HostAction, opts: HostOptions = {}) {
  return hostActionSchema.parse(await post(`${base(eventId)}/quiz/host/${action}`, hostBody(action, opts)));
}

// --- rounds ----------------------------------------------------------------------

/**
 * A round by id; or, given null, the event's current round by today's
 * paths (`/quiz`, `/quiz/questions`, `/quiz/host`) -- what the console uses
 * against a server from before rounds.
 */
const round = (eventId: number, quizId: string | null) => (quizId ? `${base(eventId)}/quizzes/${encodeURIComponent(quizId)}` : `${base(eventId)}/quiz`);

export async function fetchRounds(eventId: number) {
  return z.array(roundSummarySchema).parse(await get(`${base(eventId)}/quizzes`));
}

/** A settings change: any part of any section, merged into what is saved. */
export type SettingsPatch = {
  [K in keyof QuizSettings]?: QuizSettings[K] extends Record<string, unknown> ? Partial<QuizSettings[K]> : QuizSettings[K];
};

export async function createRound(eventId: number, body: { title?: string; settings?: SettingsPatch }) {
  return quizSchema.parse(await post(`${base(eventId)}/quizzes`, body));
}

export async function orderRounds(eventId: number, ids: string[]) {
  return z.array(roundSummarySchema).parse(await put(`${base(eventId)}/quizzes/order`, { ids }));
}

export async function fetchRound(eventId: number, quizId: string | null) {
  return quizSchema.parse(await get(round(eventId, quizId)));
}

export async function patchRound(eventId: number, quizId: string | null, body: { title?: string; intro?: string | null; settings?: SettingsPatch }) {
  return quizSchema.parse(await patch(round(eventId, quizId), body));
}

export async function deleteRound(eventId: number, quizId: string) {
  await del(round(eventId, quizId));
}

export async function addRoundQuestion(eventId: number, quizId: string | null, body: QuizQuestionBody) {
  return quizQuestionSchema.parse(await post(`${round(eventId, quizId)}/questions`, body));
}

export async function patchRoundQuestion(eventId: number, quizId: string | null, id: string, body: Partial<QuizQuestionBody>) {
  return quizQuestionSchema.parse(await patch(`${round(eventId, quizId)}/questions/${encodeURIComponent(id)}`, body));
}

export async function deleteRoundQuestion(eventId: number, quizId: string | null, id: string) {
  await del(`${round(eventId, quizId)}/questions/${encodeURIComponent(id)}`);
}

export async function orderRoundQuestions(eventId: number, quizId: string | null, ids: string[]) {
  return quizSchema.parse(await put(`${round(eventId, quizId)}/questions/order`, { ids }));
}

export async function fetchRoundHost(eventId: number, quizId: string | null) {
  return hostStateSchema.parse(await get(`${round(eventId, quizId)}/host`));
}

export async function roundHostAction(eventId: number, quizId: string | null, action: HostAction, opts: HostOptions = {}) {
  return hostActionSchema.parse(await post(`${round(eventId, quizId)}/host/${action}`, hostBody(action, opts)));
}

export async function fetchWinners(eventId: number, quizId: string, top: number) {
  return z.array(winnerSchema).parse(await get(`${round(eventId, quizId)}/winners`, { query: { top } }));
}

export async function markWinners(eventId: number, quizId: string, top: number) {
  return markOutSchema.parse(await post(`${round(eventId, quizId)}/winners/mark`, { top }));
}

export async function fetchOverall(eventId: number, top: number) {
  return z.array(overallRowSchema).parse(await get(`${base(eventId)}/leaderboard`, { query: { top } }));
}

export async function markOverall(eventId: number, top: number) {
  return markOutSchema.parse(await post(`${base(eventId)}/leaderboard/mark`, { top }));
}

/**
 * The winners as a spreadsheet, through the gateway like every other export
 * (ExportMenu adds `format=xlsx` for Excel): a round's, or across the rounds.
 */
export function winnersExportUrl(eventId: number, quizId: string | null, top: number) {
  const path = quizId ? `${round(eventId, quizId)}/winners/export` : `${base(eventId)}/leaderboard/export`;
  return `${GATEWAY_PREFIX}${path}?top=${top}`;
}

// --- Q&A ----------------------------------------------------------------------

export async function fetchQuestions(eventId: number) {
  return qaBoardSchema.parse(await get(`${base(eventId)}/questions`));
}

/**
 * Switching approval off opens the floor, and says whether to tell the room
 * Q&A is open; switching it on sends `{ approve_first }` alone. Servers from
 * before drop the field.
 */
export async function setApproveFirst(eventId: number, approve_first: boolean, notify?: boolean) {
  const body = !approve_first && notify !== undefined ? { approve_first, notify } : { approve_first };
  return qaSettingsSchema.parse(await patch(`${base(eventId)}/questions/settings`, body));
}

/** An approve or a pin puts a question up, and says whether to tell the room Q&A is open (once per event, on the server). */
export async function moderateQuestion(eventId: number, id: string, action: ModerateAction, notify?: boolean) {
  const opens = action === "approve" || action === "pin";
  const body = opens && notify !== undefined ? { action, notify } : { action };
  return moderateSchema.parse(await post(`${base(eventId)}/questions/${encodeURIComponent(id)}`, body));
}

// --- polls ----------------------------------------------------------------------

export async function fetchPolls(eventId: number) {
  return z.array(pollSchema).parse(await get(`${base(eventId)}/polls`));
}

export type PollBody = { kind: PollKind; prompt: string; options: string[]; settings?: Partial<PollSettings> };

/** Today's three fields, and settings only when any were chosen: a poll nobody tuned is today's. */
export async function createPoll(eventId: number, body: PollBody) {
  const sent = body.settings && Object.keys(body.settings).length ? body : { kind: body.kind, prompt: body.prompt, options: body.options };
  return pollSchema.parse(await post(`${base(eventId)}/polls`, sent));
}

/** A draft's kind, wording and answers; its display settings at any time. */
export async function patchPoll(eventId: number, id: string, body: Partial<PollBody>) {
  return pollSchema.parse(await patch(`${base(eventId)}/polls/${encodeURIComponent(id)}`, body));
}

/**
 * A launch says whether to notify the room; a close sends `{ status }` alone.
 * Servers from before notifying the room drop fields they do not know from
 * this body, so `notify` is safe against either.
 */
export async function setPollStatus(eventId: number, id: string, status: "live" | "closed", notify?: boolean) {
  const body = status === "live" && notify !== undefined ? { status, notify } : { status };
  return pollStatusSchema.parse(await post(`${base(eventId)}/polls/${encodeURIComponent(id)}/status`, body));
}

export async function deletePoll(eventId: number, id: string) {
  await del(`${base(eventId)}/polls/${encodeURIComponent(id)}`);
}

export async function fetchPollResponses(eventId: number, id: string, status: "pending" | "approved" | "rejected") {
  return z
    .array(pollResponseSchema)
    .parse(await get(`${base(eventId)}/polls/${encodeURIComponent(id)}/responses`, { query: { status, limit: 100 } }));
}

export async function moderatePollResponse(eventId: number, id: string, responseId: string, action: "approve" | "reject") {
  return pollResponseSchema.parse(
    await post(`${base(eventId)}/polls/${encodeURIComponent(id)}/responses/${encodeURIComponent(responseId)}`, { action }),
  );
}

// --- feedback ----------------------------------------------------------------------

export async function fetchFeedback(eventId: number) {
  return feedbackSchema.parse(await get(`${base(eventId)}/feedback`));
}

export async function putSurvey(eventId: number, change: { auto_send?: boolean; delay_minutes?: number; questions?: SurveyQuestion[] }) {
  return surveySchema.parse(await put(`${base(eventId)}/feedback`, change));
}

export async function sendSurveyNow(eventId: number) {
  return surveySchema.extend({ sent: z.number(), invited: z.number() }).parse(await post(`${base(eventId)}/feedback/send`, {}));
}

// --- updates ----------------------------------------------------------------------

export async function fetchUpdates(eventId: number) {
  return updatesPageSchema.parse(await get(`${base(eventId)}/updates`));
}

export async function pushUpdate(eventId: number, body: { kind: LiveUpdate["kind"]; text: string; audience: LiveUpdate["audience"] }) {
  return updateSchema.parse(await post(`${base(eventId)}/updates`, body));
}

export async function shiftSchedule(eventId: number, item_id: string, minutes: number) {
  return shiftOutSchema.parse(await post(`${base(eventId)}/schedule/shift`, { item_id, minutes }));
}

// --- the look ----------------------------------------------------------------------

export async function fetchTheme(eventId: number) {
  return themeOutSchema.parse(await get(`${base(eventId)}/theme`));
}

export async function putTheme(eventId: number, draft: ThemeDraft) {
  return themeOutSchema.parse(await put(`${base(eventId)}/theme`, draft));
}

export async function deleteTheme(eventId: number) {
  return themeOutSchema.parse(await del(`${base(eventId)}/theme`));
}

export async function checkTheme(eventId: number, draft: ThemeDraft) {
  return themeCheckSchema.parse(await post(`${base(eventId)}/theme/check`, draft));
}

export async function fetchThemePresets(eventId: number) {
  return z.array(themePresetSchema).parse(await get(`${base(eventId)}/theme/presets`));
}

export async function fetchMedia(eventId: number) {
  return z.array(mediaSchema).parse(await get(`${base(eventId)}/media`));
}

export async function uploadMedia(eventId: number, file: File, kind: "logo" | "background" | "option") {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return mediaSchema.parse(await post(`${base(eventId)}/media`, form));
}

export async function deleteMedia(eventId: number, id: string) {
  await del(`${base(eventId)}/media/${encodeURIComponent(id)}`);
}

// --- the screen ----------------------------------------------------------------------

export async function fetchScreen(eventId: number) {
  return screenSchema.parse(await get(`${base(eventId)}/screen`));
}

export async function fetchScreenControl(eventId: number) {
  return screenControlSchema.parse(await get(`${base(eventId)}/screen/control`));
}

export async function putScreenControl(eventId: number, change: Partial<ScreenControl>) {
  return screenControlSchema.parse(await put(`${base(eventId)}/screen/control`, change));
}
