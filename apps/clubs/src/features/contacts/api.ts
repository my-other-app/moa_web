import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { contactsPageSchema, type ContactsQuery } from "./schemas";

const base = "/api/v1/clubs/contacts";

export async function fetchContacts(q: ContactsQuery) {
  return contactsPageSchema.parse(await api.get<unknown>(base, { query: { q: q.q, event_id: q.eventId, attended: q.attended, page: q.page, page_size: q.pageSize } }));
}

/** The contact book as a CSV, with the same filters; opened through the gateway so the cookie goes with it. */
export const contactsCsvUrl = (q: ContactsQuery) => {
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.eventId != null) params.set("event_id", String(q.eventId));
  if (q.attended != null) params.set("attended", String(q.attended));
  const s = params.toString();
  return `${GATEWAY_PREFIX}${base}/export.csv${s ? `?${s}` : ""}`;
};
