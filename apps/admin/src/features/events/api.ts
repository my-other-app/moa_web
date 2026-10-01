import { api } from "@/lib/api";
import { adminEventPageSchema } from "./schemas";

export interface EventListQuery {
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchEvents(query: EventListQuery) {
  const raw = await api.get<unknown>("/api/v1/events/admin/list", {
    query: { search: query.search, offset: query.offset, limit: query.limit },
  });
  return adminEventPageSchema.parse(raw);
}
