import { api } from "@moa/app-kit";

import { aiKeySchema, aiStatusSchema, draftResultSchema, feedbackSummarySchema, writeResultSchema, type AiKeyInput, type WriteInput } from "./schemas";

/**
 * AI assist, through the gateway:
 *
 *   GET    /clubs/ai/status                          enabled, plan_allows, used, limit, resets_at, byok, provider
 *   POST   /clubs/ai/event-draft                     multipart text? and/or file? → {draft, warnings}
 *   POST   /clubs/ai/write                           {kind, language, tone, prompt, event_id} → {text, subject}
 *   GET    /events/{id}/ai/feedback-summary          {summary|null, responses, generated_at, cached}
 *   POST   /events/{id}/ai/feedback-summary/refresh  the same, regenerated (one AI action)
 *   GET    /clubs/ai/key, PUT {provider, api_key, model}, DELETE   the club's own key (owner and admins)
 */

export async function fetchAiStatus() {
  return aiStatusSchema.parse(await api.get<unknown>("/api/v1/clubs/ai/status"));
}

export async function draftEvent(input: { text?: string; file?: File | null }, signal?: AbortSignal) {
  const fd = new FormData();
  if (input.text?.trim()) fd.append("text", input.text.trim());
  if (input.file) fd.append("file", input.file, input.file.name);
  return draftResultSchema.parse(await api.post<unknown>("/api/v1/clubs/ai/event-draft", fd, { signal }));
}

export async function writeWithAi(body: WriteInput, signal?: AbortSignal) {
  return writeResultSchema.parse(await api.post<unknown>("/api/v1/clubs/ai/write", body, { signal }));
}

export async function fetchFeedbackSummary(eventId: number) {
  return feedbackSummarySchema.parse(await api.get<unknown>(`/api/v1/events/${eventId}/ai/feedback-summary`));
}

export async function refreshFeedbackSummary(eventId: number) {
  return feedbackSummarySchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/ai/feedback-summary/refresh`));
}

export async function fetchAiKey() {
  return aiKeySchema.parse(await api.get<unknown>("/api/v1/clubs/ai/key"));
}

export async function saveAiKey(body: AiKeyInput) {
  return aiKeySchema.parse(await api.put<unknown>("/api/v1/clubs/ai/key", body));
}

export async function deleteAiKey() {
  await api.del<unknown>("/api/v1/clubs/ai/key");
}
