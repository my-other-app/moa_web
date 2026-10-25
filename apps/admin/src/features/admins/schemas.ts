import { z } from "zod";

export const ADMIN_ROLES = ["viewer", "support", "owner"] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

export const ROLE_WORDS: Record<AdminRoleName, string> = {
  viewer: "Viewer — reads everything, changes nothing",
  support: "Support — moderates: approves, suspends, restores",
  owner: "Owner — everything, money and admins included",
};

export const inviteStateSchema = z.enum(["pending", "accepted", "expired", "revoked"]).catch("pending");

export const adminAccountSchema = z.object({
  id: z.number(),
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  role: z.string(),
  two_factor: z.boolean().catch(false),
  is_active: z.boolean().catch(true),
  is_you: z.boolean().catch(false),
  created_at: z.string().nullish(),
  invite: z
    .object({
      state: inviteStateSchema,
      created_at: z.string().nullish(),
      expires_at: z.string().nullish(),
      promoted: z.boolean().catch(false),
    })
    .nullish(),
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;

export const adminListSchema = z.object({
  items: z.array(adminAccountSchema),
  owners: z.number().catch(0),
  without_two_factor: z.number().catch(0),
  can_manage: z.boolean().catch(false),
});
export type AdminList = z.infer<typeof adminListSchema>;

export const inviteInputSchema = z.object({
  email: z.string().trim().email("Enter an email address"),
  full_name: z.string().trim().max(100).optional(),
  role: z.enum(ADMIN_ROLES),
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

export const inviteResultSchema = z.object({
  user_id: z.number(),
  email: z.string(),
  role: z.string(),
  promoted: z.boolean().catch(false),
  expires_in_days: z.number().catch(7),
});
export type InviteResult = z.infer<typeof inviteResultSchema>;

export const inviteCheckSchema = z.object({
  email: z.string(),
  full_name: z.string().nullish(),
  role: z.string().nullish(),
  expires_at: z.string().nullish(),
  has_password: z.boolean().catch(false),
});
export type InviteCheck = z.infer<typeof inviteCheckSchema>;

export const MIN_ADMIN_PASSWORD = 10;

export const acceptInputSchema = z
  .object({
    password: z.string().min(MIN_ADMIN_PASSWORD, `Use at least ${MIN_ADMIN_PASSWORD} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords differ", path: ["confirm"] });

/** What an invite's state reads as on the list. */
export function inviteLabel(account: AdminAccount): string | null {
  const invite = account.invite;
  if (!invite) return null;
  if (invite.state === "pending") return "Invite sent";
  if (invite.state === "expired") return "Invite expired";
  if (invite.state === "accepted") return "Joined";
  return null;
}
