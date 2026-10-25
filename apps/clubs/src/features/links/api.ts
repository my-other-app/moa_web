import { api } from "@moa/app-kit";

import { linkDetailSchema, linkSchema, linksOverviewSchema, type LinkForm, type LinkScope } from "./schemas";

const base = (scope: LinkScope) => (scope.kind === "event" ? `/api/v1/events/${scope.eventId}/links` : "/api/v1/clubs/links");

/** Every link in scope with the period's figures, its days and its channels. The club's reads its page's and its events' links together. */
export async function fetchLinksOverview(scope: LinkScope, days: number) {
  const raw = await api.get<unknown>(`${base(scope)}/overview`, { query: { days } });
  return linksOverviewSchema.parse(raw);
}

/** One link opened further: its days, hours, devices, and where the openings came from. */
export async function fetchLinkDetail(scope: LinkScope, id: string, days: number) {
  const raw = await api.get<unknown>(`${base(scope)}/${id}/detail`, { query: { days } });
  return linkDetailSchema.parse(raw);
}

function body(form: LinkForm) {
  return {
    name: form.name,
    utm_source: form.utm_source,
    utm_medium: form.utm_medium,
    utm_campaign: form.utm_campaign || null,
    utm_content: form.utm_content || null,
  };
}

export async function createLink(scope: LinkScope, form: LinkForm) {
  const raw = await api.post<unknown>(base(scope), body(form));
  return linkSchema.parse(raw);
}

/** What can change on a link once it is made: its name and its tags. The code, the clicks and what it brought stay. */
export interface LinkPatch {
  name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string | null;
  utm_content?: string | null;
}

export async function updateLink(scope: LinkScope, id: string, patch: LinkPatch) {
  const raw = await api.patch<unknown>(`${base(scope)}/${id}`, patch);
  return linkSchema.parse(raw);
}

export async function deleteLink(scope: LinkScope, id: string) {
  await api.del<unknown>(`${base(scope)}/${id}`);
}
