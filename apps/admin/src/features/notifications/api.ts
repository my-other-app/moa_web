import { api } from "@moa/app-kit";

import { notificationPageSchema, notificationSchema, readAllSchema, unreadCountSchema } from "./schemas";

/**
 * The platform's alerts to its admins. Not /admin/notifications: that is
 * the audit router's list of club announcements (features/audit).
 */
const BASE = "/api/v1/admin/alerts";

export interface NotificationQuery {
  /** Only the unread ones; left out, everything. */
  unread?: boolean | undefined;
  kind?: string | undefined;
  /** 1 to 200. */
  offset: number;
  limit: number;
}

/** `total` counts what the filters match; `unread` is every unread alert, whatever the filters. */
export async function fetchNotifications(query: NotificationQuery) {
  const raw = await api.get<unknown>(BASE, {
    query: { unread: query.unread ? true : undefined, kind: query.kind, offset: query.offset, limit: query.limit },
  });
  return notificationPageSchema.parse(raw);
}

export async function fetchUnreadCount() {
  return unreadCountSchema.parse(await api.get<unknown>(`${BASE}/unread-count`));
}

/** Marks one read and returns it; reading it again keeps the first read time. */
export async function markRead(id: string) {
  return notificationSchema.parse(await api.post<unknown>(`${BASE}/${encodeURIComponent(id)}/read`));
}

/** Marks every unread alert read, or only those of one kind. */
export async function markAllRead(kind?: string | null) {
  return readAllSchema.parse(await api.post<unknown>(`${BASE}/read-all`, undefined, { query: { kind: kind || undefined } }));
}
