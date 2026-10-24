import { api } from "@moa/app-kit";

import { historySchema, messageUsageSchema } from "./schemas";

/** GET /clubs/messages/usage: this month's emails and WhatsApp against the plan's limits. */
export async function fetchMessageUsage() {
  return messageUsageSchema.parse(await api.get<unknown>("/api/v1/clubs/messages/usage"));
}

/** GET /clubs/messages/history: the closed months, newest first. */
export async function fetchMessageHistory() {
  return historySchema.parse(await api.get<unknown>("/api/v1/clubs/messages/history"));
}
