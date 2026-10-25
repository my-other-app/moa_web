import { api } from "@moa/app-kit";

import { templatesPageSchema } from "./schemas";

export async function fetchPlatformTemplates(refresh = false) {
  return templatesPageSchema.parse(await api.get<unknown>("/api/v1/admin/whatsapp/templates", { query: { refresh: refresh ? true : undefined } }));
}
