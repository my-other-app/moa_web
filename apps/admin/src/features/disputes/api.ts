import { api } from "@moa/app-kit";

import { disputePageSchema, disputeSchema, type DisputeTab } from "./schemas";

export interface DisputeQuery {
  status: DisputeTab;
  q?: string | undefined;
  /** A column clicked; unset: the list's own order. */
  sort?: string | undefined;
  order?: "asc" | "desc" | undefined;
  offset: number;
  limit: number;
}

export async function fetchDisputes(query: DisputeQuery) {
  return disputePageSchema.parse(
    await api.get<unknown>("/api/v1/admin/disputes", { query: { status: query.status, q: query.q, sort: query.sort, order: query.order, offset: query.offset, limit: query.limit } })
  );
}

export async function addDisputeNote(id: number, text: string) {
  return disputeSchema.parse(await api.post<unknown>(`/api/v1/admin/disputes/${id}/notes`, { text }));
}
