import { api } from "@moa/app-kit";

import { nullIfAhead } from "@/lib/ahead-of-api";

import { conversationsSchema, replySchema, templatesSchema, threadSchema, unreadSchema } from "./schemas";

export const ADMIN_WHATSAPP_INBOX = "/api/v1/admin/whatsapp/inbox";

export interface ConversationFilters {
  club_id?: number | null;
  event_id?: number | null;
  unread?: boolean;
  q?: string;
  page?: number;
}

/** The sidebar's counts, or `null` on an API from before the inbox (a bare 404). */
export async function fetchUnread() {
  return nullIfAhead(async () => unreadSchema.parse(await api.get<unknown>(`${ADMIN_WHATSAPP_INBOX}/unread`)));
}

export async function fetchConversations(f: ConversationFilters) {
  const query: Record<string, string | number | boolean> = { page: f.page ?? 1, page_size: 30 };
  if (f.club_id) query.club_id = f.club_id;
  if (f.event_id) query.event_id = f.event_id;
  if (f.unread) query.unread = true;
  if (f.q?.trim()) query.q = f.q.trim();
  return conversationsSchema.parse(await api.get<unknown>(ADMIN_WHATSAPP_INBOX, { query }));
}

export async function fetchThread(id: number, before?: string | null) {
  return threadSchema.parse(await api.get<unknown>(`${ADMIN_WHATSAPP_INBOX}/${id}`, { query: before ? { before } : {} }));
}

export async function markRead(id: number) {
  return unreadSchema.parse(await api.post<unknown>(`${ADMIN_WHATSAPP_INBOX}/${id}/read`));
}

export async function fetchTemplates() {
  return templatesSchema.parse(await api.get<unknown>(`${ADMIN_WHATSAPP_INBOX}/templates`)).templates;
}

export type Reply = { mode: "text"; text: string } | { mode: "template"; template: string; params: Record<string, string> };

export async function sendReply(id: number, reply: Reply) {
  return replySchema.parse(await api.post<unknown>(`${ADMIN_WHATSAPP_INBOX}/${id}/messages`, reply));
}
