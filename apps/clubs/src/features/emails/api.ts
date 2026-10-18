import { api } from "@moa/app-kit";

import {
  audienceCountSchema,
  emailContextSchema,
  emailTemplateSchema,
  messageDetailSchema,
  messagePageSchema,
  messageSchema,
  previewResponseSchema,
  templatesSchema,
  testSendResponseSchema,
  uploadedEmailImageSchema,
  type EmailAttachments,
  type EmailAudience,
  type EmailDesign,
  type EmailScope,
  type EmailStage,
  type EmailTemplateFields,
  libraryOverviewSchema,
} from "./schemas";
import { z } from "zod";

export const scopeBase = (s: EmailScope) =>
  s.kind === "event" ? `/api/v1/events/${s.eventId}/emails` : "/api/v1/clubs/me/emails";

/** Where the editor for a template lives in the app. */
export const templateHref = (s: EmailScope, templateId: string) =>
  s.kind === "event" ? `/events/${s.eventId}/emails/${templateId}` : `/emails/${templateId}`;

export const scopeHref = (s: EmailScope) => (s.kind === "event" ? `/events/${s.eventId}/emails` : "/emails");

export async function fetchTemplates(eventId: number) {
  const raw = await api.get<unknown>(scopeBase({ kind: "event", eventId }));
  return templatesSchema.parse(raw);
}

export async function fetchLibrary() {
  const raw = await api.get<unknown>(scopeBase({ kind: "library" }));
  return z.array(emailTemplateSchema).parse(raw);
}

export async function fetchEmailContext(scope: EmailScope) {
  const raw = await api.get<unknown>(`${scopeBase(scope)}/context`);
  return emailContextSchema.parse(raw);
}

export async function fetchTemplate(scope: EmailScope, templateId: string) {
  const raw = await api.get<unknown>(`${scopeBase(scope)}/${templateId}`);
  return emailTemplateSchema.parse(raw);
}

export async function createTemplate(scope: EmailScope, fields: EmailTemplateFields, stage: EmailStage = "CUSTOM") {
  const raw = await api.post<unknown>(scopeBase(scope), { ...fields, stage });
  return emailTemplateSchema.parse(raw);
}

export async function saveTemplate(scope: EmailScope, templateId: string, fields: EmailTemplateFields) {
  const raw = await api.put<unknown>(`${scopeBase(scope)}/${templateId}`, fields);
  return emailTemplateSchema.parse(raw);
}

export async function deleteTemplate(scope: EmailScope, templateId: string) {
  await api.del<unknown>(`${scopeBase(scope)}/${templateId}`);
}

export async function duplicateTemplate(scope: EmailScope, templateId: string) {
  const raw = await api.post<unknown>(`${scopeBase(scope)}/${templateId}/duplicate`);
  return emailTemplateSchema.parse(raw);
}

export async function saveToLibrary(eventId: number, templateId: string) {
  const raw = await api.post<unknown>(`${scopeBase({ kind: "event", eventId })}/${templateId}/save-to-library`);
  return emailTemplateSchema.parse(raw);
}

export async function resetTemplate(eventId: number, templateId: string) {
  const raw = await api.post<unknown>(`${scopeBase({ kind: "event", eventId })}/${templateId}/reset`);
  return emailTemplateSchema.parse(raw);
}

/**
 * Sends a template to its audience now. `clientRef` is one per press of
 * Send, the same on a retry of that press: the API answers a ref it has
 * seen with that message and mails nobody again. (An API from before the
 * ref reads no body here, and sends as it always did.)
 */
export async function sendTemplate(eventId: number, templateId: string, clientRef?: string) {
  const raw = await api.post<unknown>(`${scopeBase({ kind: "event", eventId })}/${templateId}/send`, clientRef ? { clientRef } : undefined);
  return messageSchema.parse(raw);
}

/** A fresh idempotency key (a UUID, as the API reads it) for one press of a send button. */
export function newClientRef(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID is for secure contexts only; a v4 UUID by hand otherwise.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface PreviewBody {
  subject: string;
  design: EmailDesign;
  registrationId?: string | null;
}

export async function previewEmail(scope: EmailScope, body: PreviewBody) {
  const raw = await api.post<unknown>(`${scopeBase(scope)}/preview`, body);
  return previewResponseSchema.parse(raw);
}

export async function sendTestEmail(eventId: number, body: PreviewBody & { to: string; attachments: EmailAttachments }) {
  const raw = await api.post<unknown>(`${scopeBase({ kind: "event", eventId })}/test`, body);
  return testSendResponseSchema.parse(raw);
}

export async function countAudience(eventId: number, audience: EmailAudience) {
  const raw = await api.post<unknown>(`${scopeBase({ kind: "event", eventId })}/audience`, audience);
  return audienceCountSchema.parse(raw);
}

export async function uploadEmailImage(scope: EmailScope, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const raw = await api.post<unknown>(`${scopeBase(scope)}/images`, fd);
  return uploadedEmailImageSchema.parse(raw);
}

const messagesBase = (eventId: number) => `/api/v1/events/${eventId}/messages`;

export async function fetchMessages(eventId: number, page: number, pageSize: number) {
  const raw = await api.get<unknown>(messagesBase(eventId), { query: { page, page_size: pageSize } });
  return messagePageSchema.parse(raw);
}

export interface MessageBody {
  subject: string;
  body: string;
  design?: EmailDesign | null;
  attachments: EmailAttachments;
  audience: EmailAudience;
  clientRef: string;
}

export async function sendMessage(eventId: number, body: MessageBody) {
  const raw = await api.post<unknown>(messagesBase(eventId), body);
  return messageSchema.parse(raw);
}

export interface MessageQuery {
  problem?: boolean;
  search?: string | undefined;
  page: number;
  pageSize: number;
}

export async function fetchMessage(eventId: number, messageId: string, q: MessageQuery) {
  const raw = await api.get<unknown>(`${messagesBase(eventId)}/${messageId}`, {
    query: { problem: q.problem || undefined, search: q.search, page: q.page, page_size: q.pageSize },
  });
  return messageDetailSchema.parse(raw);
}

/** The library with how each email is used and what it did, the month, and what goes out next. */
export async function fetchLibraryOverview() {
  return libraryOverviewSchema.parse(await api.get<unknown>(`${scopeBase({ kind: "library" })}/overview`));
}
