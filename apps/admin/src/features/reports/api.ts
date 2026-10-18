import { api } from "@moa/app-kit";

import { reportPageSchema, resolveResultSchema, type ReportStatus, type Resolution } from "./schemas";

const BASE = "/api/v1/admin/reports";

export interface ReportQuery {
  status: ReportStatus;
  /** thread, comment, user or club; left out, every kind. */
  targetType?: string | undefined;
  offset: number;
  /** 1 to 100. */
  limit: number;
}

/** Newest first. Any admin may read them. */
export async function fetchReports(query: ReportQuery) {
  const raw = await api.get<unknown>(BASE, {
    query: { status: query.status, target_type: query.targetType, offset: query.offset, limit: query.limit },
  });
  return reportPageSchema.parse(raw);
}

/** How many reports are open: one row asked for, only its total read. */
export async function fetchOpenReportCount(): Promise<number> {
  const page = reportPageSchema.parse(await api.get<unknown>(BASE, { query: { status: "open", offset: 0, limit: 1 } }));
  return page.total;
}

export interface ResolveInput {
  reportId: number;
  action: Resolution;
  note?: string | undefined;
}

/**
 * Decides a report, and with it every open report on the same thing.
 * Moderate or above (403 INSUFFICIENT_ADMIN_ROLE otherwise). Refusals:
 * 404 REPORT_NOT_FOUND, 409 ALREADY_RESOLVED, 422 NOT_REMOVABLE, NO_AUTHOR,
 * CANNOT_SUSPEND_SELF.
 */
export async function resolveReport({ reportId, action, note }: ResolveInput) {
  const trimmed = note?.trim();
  const raw = await api.post<unknown>(`${BASE}/${reportId}/resolve`, { action, ...(trimmed ? { note: trimmed } : {}) });
  return resolveResultSchema.parse(raw);
}
