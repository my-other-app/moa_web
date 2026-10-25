import { api } from "@moa/app-kit";

import { disputePageSchema, disputeSchema, type DisputeTab } from "./schemas";

export interface DisputeQuery {
  status: DisputeTab;
  q?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchDisputes(query: DisputeQuery) {
  return disputePageSchema.parse(
    await api.get<unknown>("/api/v1/admin/disputes", { query: { status: query.status, q: query.q, offset: query.offset, limit: query.limit } })
  );
}

export async function addDisputeNote(id: number, text: string) {
  return disputeSchema.parse(await api.post<unknown>(`/api/v1/admin/disputes/${id}/notes`, { text }));
}
