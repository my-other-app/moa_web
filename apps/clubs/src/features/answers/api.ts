import { api } from "@moa/app-kit";
import type { WireQuestion } from "@moa/questions";

import {
  answerAskSchema,
  answersSummarySchema,
  askPreviewSchema,
  asksListSchema,
  formImpactSchema,
  moveResultSchema,
  type AskBody,
  type AskPreviewBody,
} from "./schemas";

/**
 * The missing-answers endpoints (missing-answers-contract.md §1.3–§2.1), by
 * hand: each answer is shape-checked here, so a backend that answers
 * differently fails loudly in one place rather than drawing nonsense.
 */
const base = (eventId: number) => `/api/v1/events/${eventId}`;

/** §1.3 What saving this form would do to the people already signed up. Nothing is saved; a 422 is the form's own rule errors. */
export async function previewFormImpact(eventId: number, questions: WireQuestion[]) {
  return formImpactSchema.parse(await api.post<unknown>(`${base(eventId)}/form/impact`, { additional_details: questions }));
}

/** §1.4 Who is missing what, per question, and the answers left under old keys. */
export async function fetchAnswersSummary(eventId: number) {
  return answersSummarySchema.parse(await api.get<unknown>(`${base(eventId)}/answers/summary`));
}

/** §1.5 Answers stored under an old key, moved to a current question's (owner and admin). */
export async function moveAnswers(eventId: number, from: string, to: string) {
  return moveResultSchema.parse(await api.post<unknown>(`${base(eventId)}/answers/move`, { from, to }));
}

/** §2.1 How many an ask would reach, on each channel, and whether the club's WhatsApp can carry it. */
export async function previewAsk(eventId: number, body: AskPreviewBody) {
  return askPreviewSchema.parse(await api.post<unknown>(`${base(eventId)}/answers/asks/preview`, body));
}

/** §2.1 Ask: the message goes out; `client_ref` makes a double click one ask. */
export async function createAsk(eventId: number, body: AskBody) {
  return answerAskSchema.parse(await api.post<unknown>(`${base(eventId)}/answers/asks`, body));
}

/** §2.1 Every ask of the event, newest first. */
export async function fetchAsks(eventId: number) {
  return asksListSchema.parse(await api.get<unknown>(`${base(eventId)}/answers/asks`)).asks;
}

/** §2.1 A reminder to those still askable for it now (it counts against the message quota). */
export async function remindAsk(eventId: number, askId: string) {
  return answerAskSchema.parse(await api.post<unknown>(`${base(eventId)}/answers/asks/${encodeURIComponent(askId)}/remind`, {}));
}

/** §2.1 Stop the ask: no more reminders, and the personal links say it has closed. */
export async function closeAsk(eventId: number, askId: string) {
  return answerAskSchema.parse(await api.post<unknown>(`${base(eventId)}/answers/asks/${encodeURIComponent(askId)}/close`, {}));
}
