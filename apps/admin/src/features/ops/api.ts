import { api } from "@moa/app-kit";

import { opsMeSchema, type OpsMe } from "./schemas";

export const OPS_ME_PATH = "/api/v1/admin/ops/me";

export async function fetchOpsMe(): Promise<OpsMe> {
  return opsMeSchema.parse(await api.get<unknown>(OPS_ME_PATH));
}
