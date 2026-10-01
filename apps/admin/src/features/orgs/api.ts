import { api } from "@/lib/api";
import { orgListSchema, type Org } from "./schemas";

export async function fetchOrgs(): Promise<Org[]> {
  const raw = await api.get<unknown>("/api/v1/orgs/list");
  return orgListSchema.parse(raw);
}

export async function setOrgBlocked(orgId: number, blocked: boolean): Promise<void> {
  await api.put<void>(`/api/v1/orgs/block/${orgId}`, { is_blocked: blocked });
}
