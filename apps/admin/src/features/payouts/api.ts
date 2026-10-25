import { api } from "@moa/app-kit";

import { feeFetchSchema, overviewSchema, payoutSchema, statementSchema, type PayoutInput } from "./schemas";

const BASE = "/api/v1/admin/payouts";

export interface OverviewQuery {
  q?: string | undefined;
  owing?: boolean | undefined;
  offset: number;
  limit: number;
}

export async function fetchPayoutOverview(query: OverviewQuery) {
  const raw = await api.get<unknown>(BASE, {
    query: { q: query.q, owing: query.owing ? true : undefined, offset: query.offset, limit: query.limit },
  });
  return overviewSchema.parse(raw);
}

export interface StatementQuery {
  from?: string | undefined;
  to?: string | undefined;
}

export async function fetchStatement(clubId: number, query: StatementQuery = {}) {
  return statementSchema.parse(await api.get<unknown>(`${BASE}/clubs/${clubId}`, { query: { from: query.from, to: query.to } }));
}

export async function recordPayout(clubId: number, input: PayoutInput) {
  const body = { ...input, note: input.note?.trim() || undefined, force: input.force ?? false };
  return payoutSchema.parse(await api.post<unknown>(`${BASE}/clubs/${clubId}`, body));
}

export async function voidPayout(payoutId: number, reason: string) {
  return payoutSchema.parse(await api.post<unknown>(`${BASE}/${payoutId}/void`, { reason }));
}

export async function fetchFees() {
  return feeFetchSchema.parse(await api.post<unknown>(`${BASE}/fees/fetch`));
}

/** The statement file, through the gateway like every call: the session cookie goes with it. */
export function statementCsvUrl(clubId: number, query: StatementQuery = {}): string {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const qs = params.toString();
  return `/api/gateway${BASE}/clubs/${clubId}/statement.csv${qs ? `?${qs}` : ""}`;
}
