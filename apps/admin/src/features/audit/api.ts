import { api } from "@moa/app-kit";
import { z } from "zod";

import {
  auditPageSchema,
  sentNotificationPageSchema,
} from "./schemas";

export interface AuditQuery {
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  /** Words to find in who acted, the summary, the record or the reason. */
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchAuditLog(query: AuditQuery) {
  const raw = await api.get<unknown>("/api/v1/admin/audit-log", {
    query: {
      action: query.action,
      entity_type: query.entityType,
      entity_id: query.entityId,
      // Sent only when there is something to find; an API from before the
      // log could be searched ignores it (the page then hides the box).
      q: query.search || undefined,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return auditPageSchema.parse(raw);
}

/** Drives the filter without a hard-coded list that drifts from reality. */
export async function fetchAuditActions(): Promise<string[]> {
  const raw = await api.get<unknown>("/api/v1/admin/audit-log/actions");
  return z.array(z.string()).parse(raw);
}

export async function fetchSentNotifications(query: {
  offset: number;
  limit: number;
}) {
  const raw = await api.get<unknown>("/api/v1/admin/notifications", {
    query: { offset: query.offset, limit: query.limit },
  });
  return sentNotificationPageSchema.parse(raw);
}
