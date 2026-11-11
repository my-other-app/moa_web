import { api } from "@moa/app-kit";
import { ApiError } from "@moa/api";
import { z } from "zod";

import { gatewayUrl } from "@/components/excel-export-button";
import { ADMIN, type FollowUpKind } from "@/features/teamwork";

import { DuplicateLeadError, contactSchema, importResultSchema, leadDetailSchema, leadPageSchema, leadPatchResultSchema, readMatches, type Contact, type ImportResult } from "./schemas";

const BASE = `${ADMIN}/leads`;

export interface LeadQuery {
  view: "board" | "table";
  type?: string | undefined;
  stage?: string | undefined;
  owner?: number | undefined;
  city?: string | undefined;
  due?: string | undefined;
  q?: string | undefined;
  page: number;
  pageSize: number;
}

const params = (q: LeadQuery) => ({ view: q.view, type: q.type, stage: q.stage, owner: q.owner, city: q.city, due: q.due, q: q.q, page: q.page, page_size: q.pageSize });

export async function fetchLeads(query: LeadQuery) {
  return leadPageSchema.parse(await api.get<unknown>(BASE, { query: params(query) }));
}

/** The table's leads as a workbook, with the filters on screen. */
export function leadsExportUrl(query: Omit<LeadQuery, "page" | "pageSize" | "view">): string {
  return gatewayUrl(BASE, { view: "table", type: query.type, stage: query.stage, owner: query.owner, city: query.city, due: query.due, q: query.q });
}

export interface ContactInput {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferred_channel?: string | null;
}

export interface NewLeadInput {
  name: string;
  type: string;
  owner_id?: number;
  city?: string;
  website?: string;
  source?: string;
  value_inr?: number;
  expected_close?: string;
  tags?: string[];
  contacts?: ContactInput[];
  follow_up?: { kind: FollowUpKind; title: string; due_at: string };
}

const createdSchema = z.object({ id: z.coerce.number() }).passthrough();

/**
 * A new lead, or a DuplicateLeadError with the leads it may repeat (409
 * DUPLICATE_LEAD) until sent again with `force`. The matches are read from
 * the refusal's own body, which the API client otherwise turns into a
 * message alone.
 */
export async function createLead(input: NewLeadInput, force = false) {
  let refusal: Promise<unknown> | null = null;
  try {
    const raw = await api.post<unknown>(BASE, { ...input, force }, {
      onResponse: (response) => {
        if (response.status === 409) refusal = response.clone().json().catch(() => null);
      },
    });
    return createdSchema.parse(raw);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const matches = readMatches(await refusal) ?? readMatches({ errors: error.fieldErrors });
      if (matches) throw new DuplicateLeadError(matches, error.message);
    }
    throw error;
  }
}

export async function fetchLead(id: number) {
  return leadDetailSchema.parse(await api.get<unknown>(`${BASE}/${id}`));
}

export interface LeadPatch {
  name?: string;
  type?: string;
  stage?: string;
  lost_reason?: string;
  lost_note?: string;
  retry_on?: string | null;
  owner_id?: number | null;
  city?: string | null;
  website?: string | null;
  value_inr?: number | null;
  expected_close?: string | null;
  tags?: string[];
}

/** A change to a lead; a stage move answers whether it now needs a follow-up. */
export async function updateLead(id: number, patch: LeadPatch) {
  return leadPatchResultSchema.parse((await api.patch<unknown>(`${BASE}/${id}`, patch)) ?? {});
}

export async function mergeLead(id: number, intoId: number) {
  return api.post<unknown>(`${BASE}/${id}/merge`, { into_id: intoId });
}

export async function addContact(leadId: number, input: ContactInput): Promise<Contact | null> {
  return contactSchema.safeParse(await api.post<unknown>(`${BASE}/${leadId}/contacts`, input)).data ?? null;
}

export async function updateContact(leadId: number, contactId: number, input: ContactInput) {
  return contactSchema.safeParse(await api.patch<unknown>(`${BASE}/${leadId}/contacts/${contactId}`, input)).data ?? null;
}

export async function deleteContact(leadId: number, contactId: number) {
  await api.del<unknown>(`${BASE}/${leadId}/contacts/${contactId}`);
}

export interface ActivityInput {
  kind: string;
  body: string;
  occurred_at?: string;
  contact_id?: number;
}

export async function logActivity(leadId: number, input: ActivityInput) {
  return api.post<unknown>(`${BASE}/${leadId}/activities`, input);
}

/** A proposal PDF, an MoU: kept private, opened through a link that expires. */
export async function uploadLeadFile(leadId: number, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<unknown>(`${BASE}/${leadId}/files`, fd);
}

/**
 * An Excel or CSV sheet of leads. A dry run reads every row and says what it
 * would do (new, duplicate, error) and creates nothing; the real run creates
 * the new ones. `dry_run` goes as a form field and in the query, so the API
 * finds it wherever it reads it.
 */
export async function importLeads(file: File, dryRun: boolean): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("dry_run", String(dryRun));
  return importResultSchema.parse(await api.post<unknown>(`${BASE}/import`, fd, { query: { dry_run: dryRun } }));
}

/** The sheet with the columns an import reads. */
export const IMPORT_TEMPLATE_URL = `/api/gateway${BASE}/import/template`;
