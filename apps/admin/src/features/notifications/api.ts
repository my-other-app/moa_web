import { api } from "@moa/app-kit";

import { notificationPageSchema, unreadCountSchema } from "./schemas";

const BASE = "/api/v1/admin/notifications";

export interface NotificationQuery {
  /** Only the unread ones; left out, everything. */
  unread?: boolean | undefined;
  kind?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchNotifications(query: NotificationQuery) {
  const raw = await api.get<unknown>(BASE, {
    query: { unread: query.unread ? true : undefined, kind: query.kind, offset: query.offset, limit: query.limit },
  });
  return notificationPageSchema.parse(raw);
}

export async function fetchUnreadCount() {
  return unreadCountSchema.parse(await api.get<unknown>(`${BASE}/unread-count`));
}

export async function markRead(id: string) {
  await api.post<unknown>(`${BASE}/${encodeURIComponent(id)}/read`);
}

export async function markAllRead() {
  await api.post<unknown>(`${BASE}/read-all`);
}
