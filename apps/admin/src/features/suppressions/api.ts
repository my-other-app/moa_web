import { api } from "@moa/app-kit";

import { suppressionPageSchema } from "./schemas";

export interface SuppressionQuery {
  q?: string | undefined;
  reason?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchSuppressions(query: SuppressionQuery) {
  return suppressionPageSchema.parse(
    await api.get<unknown>("/api/v1/admin/mail/suppressions", { query: { q: query.q, reason: query.reason, offset: query.offset, limit: query.limit } })
  );
}

export async function unblockAddress(email: string) {
  await api.del<unknown>(`/api/v1/admin/mail/suppressions/${encodeURIComponent(email)}`);
}
