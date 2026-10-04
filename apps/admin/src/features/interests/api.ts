import { api } from "@moa/app-kit";
import { z } from "zod";

import { interestCategorySchema, type InterestFormInput } from "./schemas";

export async function fetchInterestCategories() {
  const raw = await api.get<unknown>("/api/v1/interests/list");
  return z.array(interestCategorySchema).parse(raw);
}

export async function createInterest(input: InterestFormInput): Promise<void> {
  await api.post<void>("/api/v1/interests/create", {
    name: input.name,
    category_id: input.category_id,
    // The checker only renders an icon it recognises as an emoji, so an
    // empty one is sent as null rather than "".
    icon: input.icon?.trim() || null,
    icon_type: input.icon?.trim() ? "emoji" : null,
  });
}

export async function updateInterest(
  interestId: number,
  input: InterestFormInput
): Promise<void> {
  await api.put<void>(`/api/v1/interests/${interestId}`, {
    name: input.name,
    category_id: input.category_id,
    icon: input.icon?.trim() || null,
    icon_type: input.icon?.trim() ? "emoji" : null,
  });
}

/** Detaches it from every club, event and user that selected it. */
export async function deleteInterest(interestId: number): Promise<{ detached_from: number }> {
  return api.del<{ detached_from: number }>(`/api/v1/interests/${interestId}`);
}

export async function createInterestCategory(name: string): Promise<void> {
  await api.post<void>("/api/v1/interests/category/create", { name });
}
