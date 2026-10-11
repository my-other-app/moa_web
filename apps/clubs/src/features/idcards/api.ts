import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { cardSettingsSchema, cardSummarySchema, printJobSchema, type CardSettings } from "./schemas";
import { z } from "zod";

const base = (eventId: number) => `/api/v1/events/${eventId}/idcards`;

export async function fetchCardSummary(eventId: number) {
  return cardSummarySchema.parse(await api.get<unknown>(`${base(eventId)}/summary`));
}

export async function updateCardSettings(eventId: number, body: Partial<CardSettings>) {
  return cardSettingsSchema.parse(await api.patch<unknown>(`${base(eventId)}/settings`, body));
}

export async function fetchPrintJobs(eventId: number) {
  return z.array(printJobSchema).parse(await api.get<unknown>(`${base(eventId)}/jobs`));
}

const q = (params: Record<string, string | boolean | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

/** One guest's card, through the gateway: a link the browser opens or an iframe prints. */
export const cardPdfUrl = (eventId: number, registrationId: string, opts: { source?: string; record?: boolean; override?: boolean; door?: string | null; key?: string | null } = {}) =>
  `${GATEWAY_PREFIX}${base(eventId)}/${registrationId}.pdf${q({ source: opts.source, record: opts.record === undefined ? undefined : opts.record, override: opts.override || undefined, door: opts.door, key: opts.key })}`;

/** Every card in one PDF. */
export const batchPdfUrl = (eventId: number, opts: { scope: "all" | "not_printed"; role?: string | null; record?: boolean }) =>
  `${GATEWAY_PREFIX}${base(eventId)}/batch.pdf${q({ scope: opts.scope, role: opts.role, record: opts.record || undefined })}`;
