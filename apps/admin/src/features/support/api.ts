import { api } from "@moa/app-kit";
import { z } from "zod";

import { gatewayUrl } from "@/components/excel-export-button";
import { ADMIN } from "@/features/teamwork";

import { caseDetailSchema, casePageSchema, messageSchema, previewSchema, type CaseTab } from "./schemas";

const BASE = `${ADMIN}/support/cases`;

export interface CaseQuery {
  tab: CaseTab;
  topic?: string | undefined;
  priority?: string | undefined;
  assignee?: number | undefined;
  q?: string | undefined;
  /** Older than this many days. */
  ageDays?: number | undefined;
  page: number;
  pageSize: number;
}

const params = (q: CaseQuery) => ({ tab: q.tab, topic: q.topic, priority: q.priority, assignee: q.assignee, q: q.q, age_days: q.ageDays, page: q.page, page_size: q.pageSize });

/** A tab of the queue with its filters, and the count of every tab. Bodies never come in a list. */
export async function fetchCases(query: CaseQuery) {
  return casePageSchema.parse(await api.get<unknown>(BASE, { query: params(query) }));
}

/** The same list as a workbook: every page of it, with the filters on screen. */
export function casesExportUrl(query: Omit<CaseQuery, "page" | "pageSize">): string {
  const { page: _p, page_size: _s, ...rest } = params({ ...query, page: 1, pageSize: 1 });
  return gatewayUrl(BASE, rest);
}

export async function fetchCase(id: number) {
  return caseDetailSchema.parse(await api.get<unknown>(`${BASE}/${id}`));
}

export interface CasePatch {
  status?: string;
  priority?: string;
  topic?: string;
  assignee_id?: number | null;
  tags?: string[];
}

export async function updateCase(id: number, patch: CasePatch) {
  return caseDetailSchema.safeParse(await api.patch<unknown>(`${BASE}/${id}`, patch)).data ?? null;
}

/** A Support member takes an unassigned case. */
export async function takeCase(id: number) {
  return api.post<unknown>(`${BASE}/${id}/take`);
}

export interface MessageInput {
  kind: "reply_out" | "note";
  body: string;
  saved_reply_id?: number | undefined;
}

/** The email a reply would send, rendered, sent to nobody (`preview_only`). */
export async function previewReply(id: number, input: MessageInput) {
  return previewSchema.parse(await api.post<unknown>(`${BASE}/${id}/messages`, { ...input, preview_only: true }));
}

/** A reply (by email, with the case number in the subject; a push to an app account) or an internal note. */
export async function postMessage(id: number, input: MessageInput) {
  return messageSchema.safeParse(await api.post<unknown>(`${BASE}/${id}/messages`, input)).data ?? null;
}

export interface LogCaseInput {
  requester: { email: string; name: string } | { club_id: number } | { user_id: number };
  topic: string;
  subject: string;
  message: string;
  priority?: string | undefined;
}

const createdSchema = z.object({ id: z.coerce.number(), number: z.coerce.number().nullish() }).passthrough();

/** A call or a WhatsApp message, recorded as a case. */
export async function logCase(input: LogCaseInput) {
  return createdSchema.parse(await api.post<unknown>(BASE, { ...input, channel: "manual" }));
}

export async function mergeCase(id: number, intoId: number) {
  return api.post<unknown>(`${BASE}/${id}/merge`, { into_id: intoId });
}

/** The case's sender as a lead for Sales (a club, a sponsor…): the lead answers. */
export async function caseToLead(id: number, type: string) {
  return createdSchema.parse(await api.post<unknown>(`${BASE}/${id}/to-lead`, { type }));
}
