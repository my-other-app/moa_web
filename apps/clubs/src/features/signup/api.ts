import { api } from "@moa/app-kit";

import { toFormData, type SignupValues } from "./schemas";

/**
 * POST /clubs/create: public and multipart. The club it makes waits for an
 * admin's approval and cannot sign in until then, so nothing here starts a
 * session; the answer is only read for the name the server kept.
 */
export async function applyForClub(values: SignupValues, logo: File | null): Promise<{ name: string }> {
  const raw = await api.post<{ name?: unknown } | undefined>("/api/v1/clubs/create", toFormData(values, logo));
  return { name: typeof raw?.name === "string" && raw.name ? raw.name : values.name.trim() };
}
