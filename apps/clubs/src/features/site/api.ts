import { api } from "@moa/app-kit";

import { siteSchema, type Site, type SitePatch } from "./schemas";

const base = "/api/v1/clubs/site";

export const fetchSite = async (): Promise<Site> => siteSchema.parse(await api.get<unknown>(base));
export const patchSite = async (patch: SitePatch): Promise<Site> => siteSchema.parse(await api.patch<unknown>(base, patch));
export const previewSite = async (patch: SitePatch): Promise<string> => (await api.post<{ html: string }>(`${base}/preview`, patch)).html;
export const publishSite = async (): Promise<Site> => siteSchema.parse(await api.post<unknown>(`${base}/publish`, {}));
