import { api } from "@moa/app-kit";
import { z } from "zod";

import { pinWireFields } from "@/features/venue";

import {
  clubSelfSchema,
  interestCategorySchema,
  organizationSchema,
  type ChangePasswordForm,
  type ClubProfileForm,
  type ClubSelf,
  type InterestCategory,
  type Organization,
  clubPartnerSchema,
  clubTeamMemberSchema,
  type ClubPartner,
  type ClubTeamMember,
  type PartnerForm,
  type TeamMemberForm,
} from "./schemas";
import { clubOverviewSchema } from "./overview-schemas";
import { clubDashboardSchema } from "@moa/app-kit";

/** Where the club's events stand, what needs a decision, which doors are open. */
export async function fetchClubDashboard() {
  const raw = await api.get<unknown>("/api/v1/clubs/dashboard");
  return clubDashboardSchema.parse(raw);
}

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
 * the part out entirely. The pin is the other: see pinWireFields.
 */
export async function updateMyClub(input: ClubProfileForm): Promise<void> {
  const form = new FormData();

  const text = {
    name: input.name,
    about: input.about ?? "",
    tagline: input.tagline ?? "",
    location_name: input.location_name ?? "",
    location_link: input.location_link ?? "",
    contact_email: input.contact_email ?? "",
    contact_phone: input.contact_phone ?? "",
    instagram: input.instagram ?? "",
    youtube: input.youtube ?? "",
    linkedin: input.linkedin ?? "",
    website: input.website ?? "",
    brand_primary: input.brand_primary ?? "",
    brand_secondary: input.brand_secondary ?? "",
  };
  for (const [key, value] of Object.entries(text)) form.append(key, value);

  if (input.org_id != null) form.append("org_id", String(input.org_id));
  form.append("interest_ids", input.interest_ids.join(","));
  // lat/lng for a pin the club set, clear_point for one it removed; nothing otherwise.
  for (const [key, value] of pinWireFields(input)) form.append(key, value);

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

export async function updateClubCover(file: File): Promise<void> {
  const form = new FormData();
  form.append("cover", file);
  await api.put<void>("/api/v1/clubs/cover", form);
}

export async function createPartner(form: PartnerForm): Promise<ClubPartner> {
  const raw = await api.post<unknown>("/api/v1/clubs/partners", { name: form.name, role: form.role || null, since: form.since });
  return clubPartnerSchema.parse(raw);
}

export async function updatePartner(id: number, form: PartnerForm): Promise<ClubPartner> {
  const raw = await api.patch<unknown>(`/api/v1/clubs/partners/${id}`, { name: form.name, role: form.role || null, since: form.since });
  return clubPartnerSchema.parse(raw);
}

export async function deletePartner(id: number): Promise<void> {
  await api.del<unknown>(`/api/v1/clubs/partners/${id}`);
}

export async function createTeamMember(form: TeamMemberForm): Promise<ClubTeamMember> {
  const raw = await api.post<unknown>("/api/v1/clubs/team", teamBody(form));
  return clubTeamMemberSchema.parse(raw);
}

export async function updateTeamMember(id: number, form: TeamMemberForm): Promise<ClubTeamMember> {
  const raw = await api.patch<unknown>(`/api/v1/clubs/team/${id}`, teamBody(form));
  return clubTeamMemberSchema.parse(raw);
}

export async function deleteTeamMember(id: number): Promise<void> {
  await api.del<unknown>(`/api/v1/clubs/team/${id}`);
}

export async function updateTeamMemberPhoto(id: number, file: File): Promise<ClubTeamMember> {
  const form = new FormData();
  form.append("photo", file);
  const raw = await api.put<unknown>(`/api/v1/clubs/team/${id}/photo`, form);
  return clubTeamMemberSchema.parse(raw);
}

const teamBody = (form: TeamMemberForm) => ({ name: form.name, role: form.role || null, instagram: form.instagram || null, linkedin: form.linkedin || null, x: form.x || null, website: form.website || null });

export async function updatePartnerLogo(id: number, file: File): Promise<ClubPartner> {
  const form = new FormData();
  form.append("logo", file);
  const raw = await api.put<unknown>(`/api/v1/clubs/partners/${id}/logo`, form);
  return clubPartnerSchema.parse(raw);
}
