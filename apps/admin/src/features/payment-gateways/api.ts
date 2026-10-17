import type { Paginated } from "@moa/api";
import { api } from "@moa/app-kit";

import { gatewayPageSchema, gatewayRowSchema, type GatewayRow } from "./schemas";

const BASE = "/api/v1/admin/payment-gateways";

export interface GatewayQuery {
  status?: string | undefined;
  /** The club's name or slug. */
  search?: string | undefined;
  offset: number;
  limit: number;
}

/** `{items, total}`, given the page shape the list scaffold reads. */
export async function fetchGateways(query: GatewayQuery): Promise<Paginated<GatewayRow>> {
  const raw = await api.get<unknown>(BASE, {
    query: { status: query.status, q: query.search, offset: query.offset, limit: query.limit },
  });
  const page = gatewayPageSchema.parse(raw);
  return { items: page.items, total: page.total, limit: query.limit, offset: query.offset, next: null };
}

/** The club's new payments go to MyOtherApp's account; answers with the row as it now is. */
export async function disableGateway(clubId: number) {
  return gatewayRowSchema.parse(await api.post<unknown>(`${BASE}/${clubId}/disable`));
}
