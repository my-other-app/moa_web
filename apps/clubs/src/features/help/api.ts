import { api } from "@moa/app-kit";
import { ApiError } from "@moa/api";

import { createdSchema, helpAnswersSchema, replyResultSchema, requestDetailSchema, requestRowsSchema, topicsSchema, uploadSchema } from "./schemas";

const BASE = "/api/v1/support";

/**
 * Whether an error means "this API has no help desk yet": its bare 404
 * (FastAPI's own, for a path nothing is mounted on) or a 405. A 404 the
 * backend raises itself carries a code and is never read so.
 */
export function isHelpMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return error.routeMissing;
  return error.status === 405 && error.errorCode === null;
}

/** The published answers, or `null` on an API without the desk: Help then stays out of the menu. */
export async function fetchHelp() {
  try {
    return helpAnswersSchema.parse(await api.get<unknown>(`${BASE}/help`));
  } catch (error) {
    if (isHelpMissing(error)) return null;
    throw error;
  }
}

export async function fetchTopics() {
  return topicsSchema.parse(await api.get<unknown>(`${BASE}/topics`));
}

/** Up to three screenshots or PDFs, stored privately; their keys go with the request. */
export async function uploadFiles(files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return uploadSchema.parse(await api.post<unknown>(`${BASE}/uploads`, fd));
}

export interface NewRequest {
  topic: string;
  subject?: string;
  message: string;
  attachments: string[];
  context: Record<string, unknown>;
}

export async function createRequest(body: NewRequest) {
  return createdSchema.parse(await api.post<unknown>(`${BASE}/requests`, body));
}

/** The club's requests, newest first (a club sees every one its team sent). */
export async function fetchRequests() {
  return requestRowsSchema.parse(await api.get<unknown>(`${BASE}/requests`));
}

export async function fetchRequest(id: number) {
  return requestDetailSchema.parse(await api.get<unknown>(`${BASE}/requests/${id}`));
}

export async function replyToRequest(id: number, message: string, attachments: string[]) {
  return replyResultSchema.parse(await api.post<unknown>(`${BASE}/requests/${id}/replies`, { message, attachments }));
}

export async function sendSurvey(id: number, solved: boolean, comment: string) {
  return api.post<unknown>(`${BASE}/requests/${id}/survey`, { solved, ...(comment.trim() ? { comment: comment.trim() } : {}) });
}
