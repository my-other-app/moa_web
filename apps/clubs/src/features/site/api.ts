import { api } from "@moa/app-kit";

import { siteAnalyticsSchema, siteSchema, type Site, type SiteAnalytics, type SitePatch } from "./schemas";

const base = "/api/v1/clubs/site";

export const fetchSite = async (): Promise<Site> => siteSchema.parse(await api.get<unknown>(base));
export const patchSite = async (patch: SitePatch): Promise<Site> => siteSchema.parse(await api.patch<unknown>(base, patch));
export const previewSite = async (patch: SitePatch): Promise<string> => (await api.post<{ html: string }>(`${base}/preview`, patch)).html;
export const publishSite = async (): Promise<Site> => siteSchema.parse(await api.post<unknown>(`${base}/publish`, {}));
export const fetchSiteAnalytics = async (days: number): Promise<SiteAnalytics> => siteAnalyticsSchema.parse(await api.get<unknown>(`${base}/analytics?days=${days}`));
