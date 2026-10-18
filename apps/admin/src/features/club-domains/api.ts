import type { Paginated } from "@moa/api";
import { api } from "@moa/app-kit";

import { clubDomainPageSchema, clubDomainRowSchema, type ClubDomainRow } from "./schemas";

const BASE = "/api/v1/admin/club-domains";

export interface ClubDomainQuery {
  status?: string | undefined;
  /** The club's name or slug, or the domain. */
  search?: string | undefined;
  offset: number;
  limit: number;
}

/** `{items, total}`, given the page shape the list scaffold reads. */
export async function fetchClubDomains(query: ClubDomainQuery): Promise<Paginated<ClubDomainRow>> {
  const raw = await api.get<unknown>(BASE, {
    query: { status: query.status, q: query.search, offset: query.offset, limit: query.limit },
  });
  const page = clubDomainPageSchema.parse(raw);
  return { items: page.items, total: page.total, limit: query.limit, offset: query.offset, next: null };
}

/**
 * Looks at the domain's DNS and certificate now rather than at the next
 * automatic check. The row as it now is, when the server sends it back.
 */
export async function recheckClubDomain(id: string): Promise<ClubDomainRow | null> {
  const parsed = clubDomainRowSchema.safeParse(await api.post<unknown>(`${BASE}/${id}/recheck`));
  return parsed.success ? parsed.data : null;
}

/** Takes the domain off: the club's site is at its MyOtherApp address alone again. */
export async function removeClubDomain(id: string): Promise<void> {
  await api.del<unknown>(`${BASE}/${id}`);
}
