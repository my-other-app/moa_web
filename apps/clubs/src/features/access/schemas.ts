import { z } from "zod";

/** Roles a club gives its team. The club's own account is the owner and is not one of these. */
export const MEMBER_ROLES = ["admin", "editor", "door"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type Role = MemberRole | "owner";

/** The role every plan may give. Admin and door are the plan's `roles` feature (as the server enforces it). */
export const DEFAULT_MEMBER_ROLE: MemberRole = "editor";

export const memberRowSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string().nullable().catch(null),
  role: z.enum(MEMBER_ROLES),
  role_label: z.string(),
  status: z.enum(["invited", "active", "removed"]),
  invite_expired: z.boolean().catch(false),
  invited_at: z.string().nullable().catch(null),
  accepted_at: z.string().nullable().catch(null),
  last_seen_at: z.string().nullable().catch(null),
});
export type MemberRow = z.infer<typeof memberRowSchema>;

export const roleOptionSchema = z.object({
  key: z.enum(MEMBER_ROLES),
  label: z.string(),
  description: z.string(),
});
export type RoleOption = z.infer<typeof roleOptionSchema>;

export const accessListSchema = z.object({
  owner_email: z.string().nullable().catch(null),
  members: z.array(memberRowSchema),
  roles: z.array(roleOptionSchema),
  can_manage: z.boolean(),
});
export type AccessList = z.infer<typeof accessListSchema>;

export const capsSchema = z.object({
  manage_access: z.boolean(),
  see_access: z.boolean(),
  money: z.boolean(),
  club_profile: z.boolean(),
  edit_events: z.boolean(),
  delete_events: z.boolean(),
  door: z.boolean(),
});
export type Caps = z.infer<typeof capsSchema>;
export type Cap = keyof Caps;

export const meSchema = z.object({
  role: z.enum(["owner", ...MEMBER_ROLES]),
  role_label: z.string(),
  role_description: z.string(),
  can: capsSchema,
  club_id: z.number(),
  club_name: z.string(),
  member: memberRowSchema.nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const inviteResponseSchema = z.object({
  member: memberRowSchema,
  invite_url: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const invitePreviewSchema = z.object({
  club_name: z.string(),
  club_logo: z.string().nullable().catch(null),
  email: z.string(),
  full_name: z.string().nullable().catch(null),
  role: z.enum(MEMBER_ROLES),
  role_label: z.string(),
  role_description: z.string(),
  expired: z.boolean(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const acceptedSchema = z.object({ email: z.string(), club_name: z.string() });

/** The club's own account can do everything; it is also what the page assumes until the server says who is signed in. */
export const OWNER_CAN: Caps = {
  manage_access: true,
  see_access: true,
  money: true,
  club_profile: true,
  edit_events: true,
  delete_events: true,
  door: true,
};

export const MIN_PASSWORD = 8;
