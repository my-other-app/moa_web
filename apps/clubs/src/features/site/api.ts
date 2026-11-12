import { api } from "@moa/app-kit";
import { ApiError, toApiError } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

import { siteDomainSchema, type SiteDomain } from "./domain";
import { siteAnalyticsSchema, siteImageSchema, siteSchema, type Site, type SiteAnalytics, type SiteImage, type SitePatch } from "./schemas";

const base = "/api/v1/clubs/site";

export const fetchSite = async (): Promise<Site> => siteSchema.parse(await api.get<unknown>(base));
export const patchSite = async (patch: SitePatch): Promise<Site> => siteSchema.parse(await api.patch<unknown>(base, patch));
export const previewSite = async (patch: SitePatch): Promise<string> => (await api.post<{ html: string }>(`${base}/preview`, patch)).html;
export const publishSite = async (): Promise<Site> => siteSchema.parse(await api.post<unknown>(`${base}/publish`, {}));
export const fetchSiteAnalytics = async (days: number): Promise<SiteAnalytics> => siteAnalyticsSchema.parse(await api.get<unknown>(`${base}/analytics?days=${days}`));

// ─── The photo library ───────────────────────────────────────────────────

const imagesBase = `${base}/images`;

/** The library as an answer gives it: a list, or {images: [...]}; null when it says nothing of it. */
function imagesOf(raw: unknown): SiteImage[] | null {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { images?: unknown }).images) ? (raw as { images: unknown[] }).images : null;
  if (!list) return null;
  const parsed = list.map((i) => siteImageSchema.safeParse(i));
  return parsed.every((p) => p.success) ? parsed.map((p) => p.data as SiteImage) : null;
}

export const patchSiteImage = async (id: number, body: { alt: string | null }): Promise<SiteImage | null> => {
  const parsed = siteImageSchema.safeParse(await api.patch<unknown>(`${imagesBase}/${id}`, body));
  return parsed.success ? parsed.data : null;
};
/** The library in this order: every photo's id, once. */
export const orderSiteImages = async (ids: number[]): Promise<SiteImage[] | null> => imagesOf(await api.put<unknown>(`${imagesBase}/order`, { ids }));
export const deleteSiteImage = async (id: number): Promise<SiteImage[] | null> => imagesOf(await api.del<unknown>(`${imagesBase}/${id}`));

export interface UploadOptions {
  alt?: string | null;
  /** 0 to 1, as the bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Tests stand in for XMLHttpRequest. */
  makeRequest?: () => XMLHttpRequest;
}

/**
 * One photo into the library: multipart `file` (and `alt`), through the
 * gateway as every call goes. XMLHttpRequest rather than fetch, for the
 * upload's progress. The photo as kept, or the server's refusal as an
 * ApiError (409 SITE_IMAGES_FULL once the library holds its 20).
 */
export function uploadSiteImage(file: File, options: UploadOptions = {}): Promise<SiteImage> {
  const form = new FormData();
  if (options.alt?.trim()) form.append("alt", options.alt.trim());
  form.append("file", file, file.name);
  return new Promise((resolve, reject) => {
    const xhr = options.makeRequest ? options.makeRequest() : new XMLHttpRequest();
    xhr.open("POST", `${GATEWAY_PREFIX}${imagesBase}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(siteImageSchema.parse(JSON.parse(xhr.responseText || "{}")));
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(await toApiError(new Response(xhr.responseText || null, { status: xhr.status, headers: { "content-type": "application/json" } })));
    };
    xhr.onerror = () => reject(new ApiError({ message: "The photo couldn't be sent. Check your connection and try again.", status: 0 }));
    xhr.onabort = () => reject(new ApiError({ message: "Cancelled.", status: 0, errorCode: "CANCELLED" }));
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

// ─── The club's own domain ───────────────────────────────────────────────

const domainBase = `${base}/domain`;

export const fetchSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.get<unknown>(domainBase));
/** Starts connecting a domain (or replaces the one being connected). */
export const connectSiteDomain = async (host: string): Promise<SiteDomain> => siteDomainSchema.parse(await api.put<unknown>(domainBase, { host }));
/** Looks for the records now rather than at the next automatic check. */
export const checkSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.post<unknown>(`${domainBase}/check`, {}));
/** Takes the domain off: the site is at its default address alone again. */
export const removeSiteDomain = async (): Promise<SiteDomain> => siteDomainSchema.parse(await api.del<unknown>(domainBase));
