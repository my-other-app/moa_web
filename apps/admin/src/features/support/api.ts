import { ApiError } from "@moa/api";
import { api } from "@moa/app-kit";
import { z } from "zod";

import { gatewayUrl } from "@/components/excel-export-button";
import { DuplicateLeadError, readMatches } from "@/features/leads";
import { ADMIN } from "@/features/teamwork";

import { caseDetailSchema, casePageSchema, messageSchema, previewSchema, uploadedFileSchema, type CaseTab } from "./schemas";

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
  /** The keys of the files uploaded for it (uploadReplyFile); left out when there are none. */
  attachments?: string[] | undefined;
}

export interface UploadedFile {
  key: string;
  name: string;
  size: number;
}

/**
 * One file for a reply or a note, uploaded before it is sent: its key goes
 * in the message's `attachments`. Any kind, 10 MB at most (413
 * FILE_TOO_LARGE); only for someone who may answer the case.
 */
export async function uploadReplyFile(id: number, file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("file", file);
  const raw = uploadedFileSchema.parse(await api.post<unknown>(`${BASE}/${id}/attachments`, fd));
  return { key: raw.key, name: raw.name || file.name, size: raw.size ?? file.size };
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

/**
 * The case's sender as a lead for Sales (a club, a sponsor…): the lead
 * answers. One that looks like a lead already there is refused (409
 * DUPLICATE_LEAD) with the leads it may repeat, a DuplicateLeadError here,
 * until sent again with `force`. A case that is a lead already answers 409
 * ALREADY_A_LEAD (`errors.lead_id`), an ApiError as it is.
 */
export async function caseToLead(id: number, type: string, force = false) {
  let refusal: Promise<unknown> | null = null;
  try {
    const raw = await api.post<unknown>(`${BASE}/${id}/to-lead`, force ? { type, force: true } : { type }, {
      onResponse: (response) => {
        if (response.status === 409) refusal = response.clone().json().catch(() => null);
      },
    });
    return createdSchema.parse(raw);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.errorCode !== "ALREADY_A_LEAD") {
      const matches = readMatches(await refusal) ?? readMatches({ errors: error.fieldErrors });
      if (matches) throw new DuplicateLeadError(matches, error.message);
    }
    throw error;
  }
}

/** The lead a refused "Turn into a lead" says the case already is (409 ALREADY_A_LEAD), or null. */
export function existingLeadOf(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.errorCode !== "ALREADY_A_LEAD") return null;
  const id = Number((error.fieldErrors as Record<string, unknown> | null)?.lead_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
