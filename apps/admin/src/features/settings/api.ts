import { api } from "@moa/app-kit";

import { settingSchema, settingsPageSchema } from "./schemas";

export async function fetchSettings() {
  return settingsPageSchema.parse(await api.get<unknown>("/api/v1/admin/settings"));
}

export async function updateSetting(key: string, value: unknown) {
  return settingSchema.parse(await api.put<unknown>(`/api/v1/admin/settings/${encodeURIComponent(key)}`, { value }));
}

export async function resetSetting(key: string) {
  return settingSchema.parse(await api.del<unknown>(`/api/v1/admin/settings/${encodeURIComponent(key)}`));
}
