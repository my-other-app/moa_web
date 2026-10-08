import { api } from "@moa/app-kit";
import { z } from "zod";

import {
  clubSelfSchema,
  interestCategorySchema,
  organizationSchema,
  type ChangePasswordForm,
  type ClubProfileForm,
  type ClubSelf,
  type InterestCategory,
  type Organization,
} from "./schemas";
import { clubOverviewSchema } from "./overview-schemas";

/** Everything the dashboard shows, in one call. */
export async function fetchClubOverview(days: number) {
  const raw = await api.get<unknown>("/api/v1/clubs/overview", {
    query: { days },
  });
  return clubOverviewSchema.parse(raw);
}

export async function fetchMyClub(): Promise<ClubSelf> {
  const raw = await api.get<unknown>("/api/v1/clubs/info");
  return clubSelfSchema.parse(raw);
}

export async function fetchInterestCategories(): Promise<InterestCategory[]> {
  const raw = await api.get<unknown>("/api/v1/interests/list");
  return z.array(interestCategorySchema).parse(raw);
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const raw = await api.get<unknown>("/api/v1/orgs/list");
  return z.array(organizationSchema).parse(raw);
}

/**
 * PUT /clubs/update is multipart (it shares a handler with logo upload), so
 * the payload goes as FormData.
 *
 * Text fields are always appended, empty string included, because the handler
 * assigns whatever it receives -- omitting a field clears it rather than
 * leaving it alone. `org_id` is the exception: it is typed `int | None`, so an
 * empty string is a 422 and "no organization" has to be expressed by leaving
 * the part out entirely.
 */
export async function updateMyClub(input: ClubProfileForm): Promise<void> {
  const form = new FormData();

  const text = {
    name: input.name,
    about: input.about ?? "",
    location_name: input.location_name ?? "",
    location_link: input.location_link ?? "",
    contact_email: input.contact_email ?? "",
    contact_phone: input.contact_phone ?? "",
    instagram: input.instagram ?? "",
    youtube: input.youtube ?? "",
    linkedin: input.linkedin ?? "",
    website: input.website ?? "",
  };
  for (const [key, value] of Object.entries(text)) form.append(key, value);

  if (input.org_id != null) form.append("org_id", String(input.org_id));
  form.append("interest_ids", input.interest_ids.join(","));

  await api.put<void>("/api/v1/clubs/update", form);
}

export async function updateClubLogo(file: File): Promise<void> {
  const form = new FormData();
  form.append("logo", file);
  await api.put<void>("/api/v1/clubs/logo", form);
}

export async function changePassword(input: ChangePasswordForm): Promise<void> {
  await api.post<void>("/api/v1/auth/change-password", {
    old_password: input.old_password,
    new_password: input.new_password,
  });
}
