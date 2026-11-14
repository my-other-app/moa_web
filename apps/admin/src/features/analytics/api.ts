import {
  adminOverviewSchema,
  type AdminOverview,
  type TopClubSort,
} from "./overview-schemas";
import { api, platformDoorsSchema, type PlatformDoors } from "@moa/app-kit";
import { networkingSummarySchema, type NetworkingSummary } from "@moa/api";

export async function fetchAdminOverview(
  days: number,
  topBy: TopClubSort
): Promise<AdminOverview> {
  const raw = await api.get<unknown>("/api/v1/admin/overview", {
    query: { days, top_by: topBy },
  });
  return adminOverviewSchema.parse(raw);
}

/** Every door open on the platform, and what needs a decision. */
export async function fetchPlatformDoors(): Promise<PlatformDoors> {
  const raw = await api.get<unknown>("/api/v1/admin/doors");
  return platformDoorsSchema.parse(raw);
}

/** Profiles and networking across the platform: completed profiles, codes in use, saves, the mutual share, open profile reports. */
export async function fetchNetworkingSummary(): Promise<NetworkingSummary> {
  const raw = await api.get<unknown>("/api/v1/admin/networking/summary");
  return networkingSummarySchema.parse(raw);
}
