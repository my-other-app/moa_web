import { api } from "@/lib/api";
import { adminUserPageSchema, type AdminUserPage } from "./schemas";

export interface UserListQuery {
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchUsers(query: UserListQuery): Promise<AdminUserPage> {
  const raw = await api.get<unknown>("/api/v1/user/admin/list", {
    query: { search: query.search, offset: query.offset, limit: query.limit },
  });
  return adminUserPageSchema.parse(raw);
}
