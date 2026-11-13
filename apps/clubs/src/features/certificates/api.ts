import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { certificateSummarySchema } from "@/features/deliveries";

import {
  certificatePageSchema,
  applyDesignResponseSchema,
  certificateStateSchema,
  issuePreviewSchema,
  issueResponseSchema,
  type CertificateAudience,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/certificates`;

export interface IssueBody {
  audience: CertificateAudience;
  roles: string[];
}

export async function fetchCertificateSummary(eventId: number) {
  const raw = await api.get<unknown>(`${base(eventId)}/summary`);
  return certificateSummarySchema.parse(raw);
}

export async function fetchIssuePreview(eventId: number, body: IssueBody) {
  const raw = await api.post<unknown>(`${base(eventId)}/issue-preview`, body);
  return issuePreviewSchema.parse(raw);
}

/**
 * Put every certificate already issued on the event onto its role's design
 * as it is now. Issued certificates otherwise keep the design they were
 * issued with; this is the club's explicit choice to change that.
 */
export async function applyDesignToIssued(eventId: number) {
  const raw = await api.post<unknown>(`${base(eventId)}/apply-design`, { confirm: true });
  return applyDesignResponseSchema.parse(raw);
}

export async function issueCertificates(eventId: number, body: IssueBody) {
  const raw = await api.post<unknown>(`${base(eventId)}/issue`, body);
  return issueResponseSchema.parse(raw);
}

export interface CertificateQuery {
  eventId: number;
  status?: "issued" | "revoked";
  search?: string;
  /** "field:direction": ticket (the default), name, number or issued. */
  sort?: string;
  page: number;
  pageSize: number;
}

/** The certificates list's orders (GET …/certificates `sort` + `order`). */
export const CERTIFICATE_SORTS = [
  { value: "", label: "Ticket number" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "number:asc", label: "Certificate number" },
  { value: "issued:desc", label: "Newest issued" },
  { value: "issued:asc", label: "Oldest issued" },
] as const;

export async function fetchCertificates(q: CertificateQuery) {
  const [sort, order] = (q.sort ?? "").split(":");
  const raw = await api.get<unknown>(base(q.eventId), {
    query: { status: q.status, search: q.search, sort: sort || undefined, order: order || undefined, page: q.page, page_size: q.pageSize },
  });
  return certificatePageSchema.parse(raw);
}

export async function setCertificateRevoked(eventId: number, registrationId: string, revoked: boolean) {
  const raw = await api.post<unknown>(`${base(eventId)}/${registrationId}/${revoked ? "revoke" : "reinstate"}`);
  return certificateStateSchema.parse(raw);
}

/** The PDF itself, through the gateway -- a plain link the browser opens. */
export const certificatePdfUrl = (ticketId: string) =>
  `${GATEWAY_PREFIX}/api/v1/events/certificates/${encodeURIComponent(ticketId)}/pdf`;
