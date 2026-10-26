import { api } from "@moa/app-kit";

import {
  CHUNK_SIZE,
  MAX_IDS_PER_CALL,
  approveResultSchema,
  declineResultSchema,
  reopenResultSchema,
  requestPageSchema,
  type RequestStatus,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/registration/${eventId}/requests`;

export interface RequestQuery {
  status: RequestStatus;
  /** Name, email or phone. */
  q?: string;
  /** The `next` cursor of the page before. */
  after?: string | null;
  limit?: number;
}

/** GET …/requests: one page of a status, oldest first, with every status's count and the places left. */
export async function fetchRequests(eventId: number, query: RequestQuery) {
  const raw = await api.get<unknown>(base(eventId), {
    query: { status: query.status, q: query.q?.trim() || undefined, after: query.after ?? undefined, limit: query.limit },
  });
  return requestPageSchema.parse(raw);
}

const guard = (ids: readonly string[]) => {
  if (ids.length > MAX_IDS_PER_CALL) throw new Error(`At most ${MAX_IDS_PER_CALL} requests per call (got ${ids.length}).`);
};

/** POST …/requests/approve with ids: the pending ones among them confirmed in queue order, the rest skipped with a reason. */
export async function approveRequests(eventId: number, ids: readonly string[]) {
  guard(ids);
  return approveResultSchema.parse(await api.post<unknown>(`${base(eventId)}/approve`, { ids }));
}

/** POST …/requests/approve with all_pending: the oldest `limit` waiting, whoever they are. */
export async function approveAllPending(eventId: number, limit: number = CHUNK_SIZE) {
  return approveResultSchema.parse(await api.post<unknown>(`${base(eventId)}/approve`, { all_pending: true, limit: Math.min(MAX_IDS_PER_CALL, Math.max(1, limit)) }));
}

export interface DeclineBody {
  ids: readonly string[];
  /** Email them to say so. */
  notify: boolean;
  /** A short note, in the email and on their request's page. */
  note?: string;
}

/** POST …/requests/decline. */
export async function declineRequests(eventId: number, body: DeclineBody) {
  guard(body.ids);
  const note = body.note?.trim();
  return declineResultSchema.parse(await api.post<unknown>(`${base(eventId)}/decline`, { ids: body.ids, notify: body.notify, ...(note ? { note } : {}) }));
}

/** POST …/requests/reopen: declined or lapsed, back to waiting. */
export async function reopenRequests(eventId: number, ids: readonly string[]) {
  guard(ids);
  return reopenResultSchema.parse(await api.post<unknown>(`${base(eventId)}/reopen`, { ids }));
}
