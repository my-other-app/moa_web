import { api } from "@moa/app-kit";

import { backfillSchema, clubMailboxSchema } from "./schemas";

const BASE = "/api/v1/admin/club-mailbox";

export async function fetchClubMailbox(clubId: number) {
  return clubMailboxSchema.parse(await api.get<unknown>(`${BASE}/${clubId}`));
}

/** PUT /admin/club-mailbox/{club_id}/address: no monthly limit for an admin; the old address forwards 90 days. */
export async function changeClubAddress(clubId: number, handle: string) {
  return clubMailboxSchema.parse(await api.put<unknown>(`${BASE}/${clubId}/address`, { handle: handle.trim().toLowerCase() }));
}

/** POST /admin/club-mailbox/backfill (owner): every club without an address gets one from its name, oldest club first. */
export async function backfillAddresses(dryRun: boolean) {
  return backfillSchema.parse(await api.post<unknown>(`${BASE}/backfill`, { dry_run: dryRun }));
}
