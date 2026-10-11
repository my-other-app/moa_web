import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import { z } from "zod";

import { closeoutSettingsSchema, figuresSchema, reportSchema, retentionStatusSchema, runResultSchema, type SettingsPatch } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/closeout`;

export async function fetchFigures(eventId: number) {
  return figuresSchema.parse(await api.get<unknown>(`${base(eventId)}/figures`));
}
export async function fetchReports(eventId: number) {
  return z.array(reportSchema).parse(await api.get<unknown>(`${base(eventId)}/reports`));
}
export async function generateReport(eventId: number) {
  return reportSchema.parse(await api.post<unknown>(`${base(eventId)}/reports`, {}));
}
export const reportPdfUrl = (eventId: number, reportId: string) => `${GATEWAY_PREFIX}${base(eventId)}/reports/${reportId}.pdf`;
export async function fetchCloseoutSettings(eventId: number) {
  return closeoutSettingsSchema.parse(await api.get<unknown>(`${base(eventId)}/settings`));
}
export async function updateCloseoutSettings(eventId: number, body: SettingsPatch) {
  return closeoutSettingsSchema.parse(await api.patch<unknown>(`${base(eventId)}/settings`, body));
}
export async function fetchRetention(eventId: number) {
  return retentionStatusSchema.parse(await api.get<unknown>(`${base(eventId)}/retention`));
}
export async function runRetention(eventId: number, confirmSlug: string) {
  return runResultSchema.parse(await api.post<unknown>(`${base(eventId)}/retention/run`, { confirm_slug: confirmSlug }));
}
