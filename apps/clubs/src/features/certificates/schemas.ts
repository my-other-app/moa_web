import { z } from "zod";

import { deliveryBriefSchema } from "@/features/deliveries";

export const CERTIFICATE_AUDIENCES = [
  { value: "checked_in", label: "Everyone who checked in", note: "The usual rule: a certificate says they were there." },
  { value: "everyone", label: "Everyone registered", note: "Including no-shows — for an online event, or a course." },
  { value: "roles", label: "Certain roles", note: "Speakers, staff, or attendees only." },
] as const;
export type CertificateAudience = (typeof CERTIFICATE_AUDIENCES)[number]["value"];

export const issuePreviewSchema = z.object({
  eligible: z.number(),
  already_issued: z.number(),
  to_issue: z.number(),
  outdated: z.number(),
});
export type IssuePreview = z.infer<typeof issuePreviewSchema>;

export const issueResponseSchema = z.object({
  issued: z.number(),
  refreshed: z.number(),
  already_issued: z.number(),
});

export const certificateRowSchema = z.object({
  registration_id: z.string(),
  ticket_id: z.string(),
  number: z.string(),
  name: z.string(),
  email: z.string().nullish(),
  role: z.string(),
  status: z.enum(["issued", "revoked"]),
  issued_at: z.string().nullish(),
  revoked_at: z.string().nullish(),
  design_version: z.number().default(0),
  deliveries: z.array(deliveryBriefSchema).default([]),
});
export type CertificateRow = z.infer<typeof certificateRowSchema>;

export const certificatePageSchema = z.object({
  items: z.array(certificateRowSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});

export const certificateStateSchema = z.object({
  registration_id: z.string(),
  number: z.string(),
  revoked_at: z.string().nullish(),
});
