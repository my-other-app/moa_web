import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { contactsPageSchema, type ContactFilters } from "./schemas";

function query(f: ContactFilters) {
  return {
    q: f.q?.trim() || undefined,
    event_id: f.event_id ?? undefined,
    attended: f.attended ?? undefined,
    since: f.since || undefined,
    until: f.until || undefined,
  };
}

export async function fetchContacts(f: ContactFilters, page: number, pageSize: number) {
  const raw = await api.get<unknown>("/api/v1/clubs/contacts", { query: { ...query(f), page, page_size: pageSize } });
  return contactsPageSchema.parse(raw);
}

/** The same filters as a file: the browser downloads it through the gateway, cookie and all. */
export function contactsExportUrl(f: ContactFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query(f))) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return `${GATEWAY_PREFIX}/api/v1/clubs/contacts/export.csv${qs ? `?${qs}` : ""}`;
}
