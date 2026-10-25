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
  /** The WhatsApp permission: reads and answers the club's own WhatsApp inbox, whatever the role. */
  whatsapp: z.boolean().catch(false),
  /** The Mail permission: reads, answers and sends from the club's mailbox, whatever the role. A server without it: false. */
  mail: z.boolean().catch(false),
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

export const capsSchema = z
  .object({
    manage_access: z.boolean(),
    see_access: z.boolean(),
    money: z.boolean(),
    club_profile: z.boolean(),
    edit_events: z.boolean(),
    delete_events: z.boolean(),
    door: z.boolean(),
    /** Every connected AI assistant, not only one's own (owner and admin). */
    connected_apps: z.boolean().optional(),
    /** Approving what an assistant asked for: publishing, sending (owner, admin, editor). */
    approve_actions: z.boolean().optional(),
    /** The club's own WhatsApp number's connection: its keys, routing, retention (owner and admin). */
    whatsapp_account: z.boolean().optional(),
    /** The club's WhatsApp inbox and templates: the owner, and members given the WhatsApp permission. */
    whatsapp_inbox: z.boolean().optional(),
    /** The club's mailbox: its mail, for the owner and members given the Mail permission. */
    mail_inbox: z.boolean().optional(),
    /** The mailbox's address and settings (owner and admin). */
    mailbox_manage: z.boolean().optional(),
    /** The contact book close-out kept: guests' names, emails and phones (owner, admin, editor; never door staff). */
    contacts: z.boolean().optional(),
    /** Cancelling an event that has registrations, with its refunds (owner, admin). */
    cancel_events: z.boolean().optional(),
  })
  // A server from before connected assistants does not send the last two: they follow the roles they mirror.
  // One from before clubs' own WhatsApp sends neither of those: there is nothing to open.
  .transform((c) => ({
    ...c,
    connected_apps: c.connected_apps ?? c.see_access,
    approve_actions: c.approve_actions ?? c.edit_events,
    whatsapp_account: c.whatsapp_account ?? false,
    whatsapp_inbox: c.whatsapp_inbox ?? false,
    // A server from before the contact book and cancelling: they follow the roles that have them there.
    contacts: c.contacts ?? c.edit_events,
    cancel_events: c.cancel_events ?? c.money,
    /** The server sent `cancel_events`: it has cancelling and club refunds (the same release). */
    refunds_known: c.cancel_events !== undefined,
    /** Either: the WhatsApp section opens at all. */
    whatsapp: Boolean(c.whatsapp_account || c.whatsapp_inbox),
    /**
     * The server sent either WhatsApp cap: it has clubs' own WhatsApp. When it
     * sent neither (it predates it), a WhatsApp address is not a role's to be
     * refused: the page says the section isn't available yet (RouteGate).
     */
    whatsapp_known: c.whatsapp_account !== undefined || c.whatsapp_inbox !== undefined,
    mail_inbox: c.mail_inbox ?? false,
    mailbox_manage: c.mailbox_manage ?? false,
    /** Either: the Mail section opens at all (once the server says mailboxes are on). */
    mail: Boolean(c.mail_inbox || c.mailbox_manage),
    /** The server sent either Mail cap: it has clubs' mailboxes. Neither: a /mail address refuses no role. */
    mail_known: c.mail_inbox !== undefined || c.mailbox_manage !== undefined,
  }));
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
  connected_apps: true,
  approve_actions: true,
  whatsapp_account: true,
  whatsapp_inbox: true,
  whatsapp: true,
  whatsapp_known: true,
  mail_inbox: true,
  mailbox_manage: true,
  mail: true,
  mail_known: true,
  contacts: true,
  cancel_events: true,
  // Until the server says who is signed in, nothing is known about what it has.
  refunds_known: false,
};

export const MIN_PASSWORD = 8;
