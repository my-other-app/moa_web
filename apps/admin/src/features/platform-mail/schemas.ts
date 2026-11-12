import { z } from "zod";

/**
 * The platform's own mailboxes (app/api/platform_mail): admin@, developer@,
 * developers@ and info@myotherapp.in, read and answered here by admins
 * with the owner or support role. Their threads, mail and files are the
 * club mailbox's shapes (@moa/mail-ui), each with its `mailbox` ("info").
 */

const count = z.coerce.number().catch(0);

/** One address, its local part (what the API filters and sends by), and what waits unread in it. */
export const mailAddressSchema = z
  .object({
    address: z.string(),
    mailbox: z.string().nullish().catch(null),
    unread: count,
  })
  .transform((a) => ({ address: a.address.toLowerCase(), mailbox: (a.mailbox || a.address.split("@")[0] || "").toLowerCase(), unread: a.unread }));
export type MailAddress = z.infer<typeof mailAddressSchema>;

/** GET /admin/mail: the addresses and what is unread, in each and in all. */
export const mailOverviewSchema = z.object({
  addresses: z.array(z.unknown()).catch([]).transform((items) => items.flatMap((x) => {
    const parsed = mailAddressSchema.safeParse(x);
    return parsed.success && parsed.data.mailbox ? [parsed.data] : [];
  })),
  unread_total: count,
});
export type MailOverview = z.infer<typeof mailOverviewSchema>;

/** The address a local part stands for, from the list (or on the platform's domain). */
export function addressOf(mailbox: string | null | undefined, addresses: MailAddress[]): string | null {
  if (!mailbox) return null;
  return addresses.find((a) => a.mailbox === mailbox)?.address ?? `${mailbox}@myotherapp.in`;
}

/** What each refusal means here, when the server gave no sentence of its own. */
export const PLATFORM_ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_ADMIN_ROLE: "Mail is for admins with the owner or support role.",
  MAILBOX_RATE_LIMITED: "The platform's mailboxes have sent as much as they may for now. Try again later.",
  PLATFORM_MAIL_RATE_LIMITED: "The platform's mailboxes have sent as much as they may for now. Try again later.",
  FROM_MAILBOX_INVALID: "Pick one of the platform's addresses under From.",
  INVALID_MAILBOX: "Pick one of the platform's addresses under From.",
};
