import { api } from "@moa/app-kit";

import { siteDomainSchema, type SiteDomain } from "./domain";
import { siteAnalyticsSchema, siteSchema, type Site, type SiteAnalytics, type SitePatch } from "./schemas";

const base = "/api/v1/clubs/site";

export const fetchSite = async (): Promise<Site> => siteSchema.parse(await api.get<unknown>(base));
export const patchSite = async (patch: SitePatch): Promise<Site> => siteSchema.parse(await api.patch<unknown>(base, patch));
export const previewSite = async (patch: SitePatch): Promise<string> => (await api.post<{ html: string }>(`${base}/preview`, patch)).html;
export const publishSite = async (): Promise<Site> => siteSchema.parse(await api.post<unknown>(`${base}/publish`, {}));
export const fetchSiteAnalytics = async (days: number): Promise<SiteAnalytics> => siteAnalyticsSchema.parse(await api.get<unknown>(`${base}/analytics?days=${days}`));

// ─── The club's own domain ───────────────────────────────────────────────

const domainBase = `${base}/domain`;

export const fetchSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.get<unknown>(domainBase));
/** Starts connecting a domain (or replaces the one being connected). */
export const connectSiteDomain = async (host: string): Promise<SiteDomain> => siteDomainSchema.parse(await api.put<unknown>(domainBase, { host }));
/** Looks for the records now rather than at the next automatic check. */
export const checkSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.post<unknown>(`${domainBase}/check`, {}));
/** Takes the domain off: the site is at its default address alone again. */
export const removeSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.del<unknown>(domainBase));
