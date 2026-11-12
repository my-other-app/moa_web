import { api } from "@moa/app-kit";

import { slugChangeSchema, type SlugKind } from "./schemas";

/** PATCH /admin/clubs/{id}/slug or /admin/events/{id}/slug: the old slug becomes an alias that redirects here. */
export async function changeSlug(kind: SlugKind, id: number, slug: string) {
  const path = kind === "club" ? `/api/v1/admin/clubs/${id}/slug` : `/api/v1/admin/events/${id}/slug`;
  return slugChangeSchema.parse(await api.patch<unknown>(path, { slug: slug.trim().toLowerCase() }));
}
