"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";
import { api } from "@moa/app-kit";
import { Notice } from "@moa/ui";

export const BANNER_PATH = "/api/v1/platform/banner";

async function fetchBanner(): Promise<string | null> {
  const data = await nullIfRouteMissing(() => api.get<{ message?: string | null } | null>(BANNER_PATH));
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  return message || null;
}

/**
 * The line MyOtherApp's owners set on the admin portal's Settings page --
 * planned maintenance, an outage being fixed -- above every page. Nothing at
 * all when there is none, when the API has no such route yet, or when it
 * cannot be read.
 */
export function MaintenanceBanner() {
  const { data } = useQuery({ queryKey: ["platform", "banner"], queryFn: fetchBanner, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
  if (!data) return null;
  return (
    <Notice tone="caution" tag="Notice" className="mb-4">
      {data}
    </Notice>
  );
}
