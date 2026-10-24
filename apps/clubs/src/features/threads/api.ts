import { api } from "@moa/app-kit";

import { commentSchema, threadInsightsSchema, threadSchema, threadsPageSchema, type ComposeInput, type ThreadScope, type ThreadSort } from "./schemas";
import { z } from "zod";

const BASE = "/api/v1/clubs/threads";

/**
 * One multipart request: the text, the switch, the poll's options and the
 * photo together, so a post with a photo never exists half-made.
 */
export async function createThread(input: ComposeInput, photo: File | null) {
  const form = new FormData();
  form.append("body", input.body);
  form.append("notify_followers", String(input.notify_followers));
  const options = input.poll_options.map((o) => o.trim()).filter(Boolean);
  if (options.length > 0) form.append("poll_options", JSON.stringify(options));
  if (photo) form.append("image", photo);
  const raw = await api.post<unknown>(BASE, form);
  return threadSchema.parse(raw);
}

export async function setPinned(id: string, pinned: boolean) {
  const raw = await api.patch<unknown>(`${BASE}/${id}`, { pinned });
  return threadSchema.parse(raw);
}

export async function deleteThread(id: string) {
  await api.del<unknown>(`${BASE}/${id}`);
}

export async function fetchComments(id: string) {
  const raw = await api.get<unknown>(`${BASE}/${id}/comments`);
  return z.array(commentSchema).parse(raw);
}

export async function deleteComment(id: string, commentId: string) {
  await api.del<unknown>(`${BASE}/${id}/comments/${commentId}`);
}

export async function replyAsClub(id: string, body: string) {
  const raw = await api.post<unknown>(`${BASE}/${id}/comments`, { body });
  return commentSchema.parse(raw);
}

export async function fetchThreadsPage(params: { scope: ThreadScope; sort: ThreadSort; offset: number; limit: number }) {
  return threadsPageSchema.parse(await api.get<unknown>(`${BASE}/page`, { query: params }));
}

export async function fetchThreadInsights() {
  return threadInsightsSchema.parse(await api.get<unknown>(`${BASE}/insights`));
}
