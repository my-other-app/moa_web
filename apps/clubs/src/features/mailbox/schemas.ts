import { z } from "zod";

/**
 * The club's mailbox, as the backend answers it (app/api/club_mailbox):
 * one address on the platform's domain, `<handle>@myotherapp.in`, its
 * mail received into the dashboard, answered and written from it.
 *
 * Everything here reads what it can and turns the rest into its empty form
 * (`.catch`), so a field the server adds or renames never fails a page.
 */

const str = z.string().nullish().default(null).catch(null);
const when = z.string().nullish().default(null).catch(null);
const count = z.coerce.number().catch(0);

export const upgradeSchema = z
  .object({
    feature: z.string().nullish().catch(null),
    label: z.string().nullish().catch(null),
    required_plan: z.string().nullish().catch(null),
    required_plan_name: z.string().nullish().catch(null),
    upgrade_url: z.string().nullish().catch(null),
  })
  .nullish()
  .catch(null);
export type Upgrade = z.infer<typeof upgradeSchema>;

/**
 * open; lapsed (the plan dropped it: readable 30 days); expired (export or
 * delete); reserved (every club gets its address from its name, but on a
 * plan without the mailbox no mail is kept: the address waits for Pro).
 */
export const STATES = ["open", "lapsed", "expired", "reserved"] as const;
export type MailboxState = (typeof STATES)[number];

/** GET /clubs/mailbox: whether it is open here, the address, what the plan allows, what the viewer may do. Never a mail. */
export const mailboxSchema = z.object({
  /** False for a server without the routes (route-level 404): the section stays hidden. */
  on_server: z.boolean().catch(true).default(true),
  /** The feature switch on that server (APP_CLUB_MAILBOX). */
  available: z.boolean().catch(false),
  domain: z.string().catch("myotherapp.in"),
  plan_allows: z.boolean().catch(true),
  upgrade: upgradeSchema,
  set_up: z.boolean().catch(false),
  address: str,
  handle: str,
  /** Given from the club's name rather than picked (the first change from it is free). */
  automatic: z.boolean().catch(false),
  previous: z.array(z.object({ address: z.string(), forward_until: when })).catch([]),
  display_name: str,
  signature: str,
  retention_months: z.coerce.number().catch(12),
  next_change_at: when,
  state: z.enum(STATES).catch("open"),
  lapsed_at: when,
  readable_until: when,
  can_manage: z.boolean().catch(false),
  can_mail: z.boolean().catch(false),
  is_owner: z.boolean().catch(false),
  impersonated: z.boolean().catch(false),
  credits_left: z.coerce.number().nullable().catch(null),
  limits: z
    .object({ per_hour: count, per_day: count, recipients: count, attachments_mb: z.coerce.number().catch(10) })
    .catch({ per_hour: 60, per_day: 300, recipients: 50, attachments_mb: 10 }),
});
export type Mailbox = z.infer<typeof mailboxSchema>;

export const handleCheckSchema = z.object({
  handle: z.string(),
  address: z.string().catch(""),
  available: z.boolean().catch(false),
  code: str,
  message: str,
});
export type HandleCheck = z.infer<typeof handleCheckSchema>;

// ─── The mail itself: the same shapes as the platform's mailbox (@moa/mail-ui) ──

export {
  summarySchema,
  FOLDERS,
  FOLDER_LABEL,
  threadSchema,
  threadListSchema,
  attachmentSchema,
  MESSAGE_STATUSES,
  messageSchema,
  threadDetailSchema,
  type MailSummary,
  type Folder,
  type MailThread,
  type ThreadList,
  type MailAttachment,
  type MessageStatus,
  type MailMessage,
  type ThreadDetail,
} from "@moa/mail-ui";

// ─── Refusals ────────────────────────────────────────────────────────────

export const MAILBOX_PRIVATE = "MAILBOX_PRIVATE";
export const MAILBOX_PERMISSION = "MAILBOX_PERMISSION";
export const MAILBOX_LAPSED = "MAILBOX_LAPSED";
export const NO_EMAIL_CREDITS = "NO_EMAIL_CREDITS";
export const PRIVATE_MESSAGE = "A club's mail is for its own team. Acting as the club, you can see whether its mailbox is set up, not its mail.";
export const PERMISSION_MESSAGE = "You need the Mail permission to see the club's mail. Ask the club's owner.";
export const BUY_CREDITS = "You're out of email credits. Buy more email credits to send from the club's mailbox.";

/** What each refusal means, when the server gave no sentence of its own. */
export const ERROR_TEXT: Record<string, string> = {
  NO_EMAIL_CREDITS: BUY_CREDITS,
  MAILBOX_RATE_LIMITED: "The club's mailbox has sent as much as it may for now. Try again later.",
  RECIPIENT_SUPPRESSED: "One of the addresses can't be mailed: it bounced or marked mail as spam before. Take it out to send.",
  ATTACHMENTS_TOO_LARGE: "Files can weigh 10 MB at most together.",
  INVALID_ADDRESS: "One of the addresses isn't an email address.",
  NO_RECIPIENTS: "Who is it to? Add an address in To.",
  TOO_MANY_RECIPIENTS: "That's too many people for one mail.",
  EMPTY_MAIL: "Write something first.",
  PLAN_FEATURE_LOCKED: "The club mailbox is part of Pro and Enterprise.",
  MAILBOX_LAPSED: "Your plan no longer includes the mailbox and its 30 days are over. The club's owner can export the mail, or delete it, from Mail settings.",
  MAILBOX_PRIVATE: PRIVATE_MESSAGE,
  MAILBOX_PERMISSION: PERMISSION_MESSAGE,
  MAILBOX_OFF: "Club mailboxes aren't open yet.",
  NO_MAILBOX: "Pick the club's address first, in Mail settings.",
  ATTACHMENT_GONE: "A file can't be read any more; send it without it.",
  HANDLE_INVALID: "Use 3 to 30 letters, numbers, dots and hyphens, starting and ending with a letter or a number.",
  HANDLE_RESERVED: "That address is kept for the platform. Pick another.",
  HANDLE_TAKEN: "That address is taken. Pick another.",
  HANDLE_CHANGED_RECENTLY: "The address can change once a month.",
  NOT_FAILED: "Only mail that wasn't sent can be sent again.",
  CONFIRM_DELETE: "Type DELETE to delete all of the mail.",
  OWNER_ONLY: "Only the club's own account can export or delete all of its mail.",
};

// ─── Small helpers ───────────────────────────────────────────────────────

/** The handle's rules, as the server holds them (app/api/club_mailbox/handles.py), for a hint before asking. */
export const HANDLE_RULE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export function handleProblem(value: string): string | null {
  const h = value.trim().toLowerCase();
  if (!h) return null;
  if (h.length < 3 || h.length > 30) return "An address is 3 to 30 characters.";
  if (!HANDLE_RULE.test(h)) return "Use letters, numbers, dots and hyphens, starting and ending with a letter or a number.";
  if (/[.-]{2}/.test(h)) return "No two dots or hyphens in a row.";
  return null;
}

// ─── Reading and showing mail: shared with the platform's mailbox ───────

export {
  splitAddresses,
  isAddress,
  replySubject,
  senderName,
  initialsOf,
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  textBlocks,
  CSP_BLOCKED,
  CSP_IMAGES,
  FRAME_SANDBOX,
  srcdocFor,
  INLINE_IMAGE_MAX,
  cidsIn,
  withInlineImages,
} from "@moa/mail-ui";
