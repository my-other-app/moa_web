import { api } from "@moa/app-kit";
import { avatarListSchema, type AppAvatar } from "./schemas";

export async function fetchAvatars(): Promise<AppAvatar[]> {
  const raw = await api.get<unknown>("/api/v1/user/avatar/list");
  return avatarListSchema.parse(raw);
}
