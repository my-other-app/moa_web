import { api } from "@moa/app-kit";

import { clubMailboxSchema } from "./schemas";

export async function fetchClubMailbox(clubId: number) {
  return clubMailboxSchema.parse(await api.get<unknown>(`/api/v1/admin/club-mailbox/${clubId}`));
}
