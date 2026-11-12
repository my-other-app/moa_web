import { z } from "zod";

/**
 * A club's mailbox, as a platform admin sees it (GET /admin/club-mailbox/{club_id}):
 * its address, whether it is open, and counts. Never a subject, a sender or
 * a word of any mail.
 */
const when = z.string().nullish().default(null).catch(null);
const count = z.coerce.number().catch(0);

export const clubMailboxSchema = z.object({
  club_id: z.number(),
  /** Club mailboxes are switched on on this server (APP_CLUB_MAILBOX). */
  available: z.boolean().catch(false),
  plan_allows: z.boolean().catch(false),
  set_up: z.boolean().catch(false),
  address: z.string().nullish().default(null).catch(null),
  /** The address's local part ("gdgcloudtrivandrum"). */
  handle: z.string().nullish().default(null).catch(null),
  /** Given from the club's name, not picked by the club (it may still change it once). */
  automatic: z.boolean().catch(false),
  /** Its old addresses, forwarding here until a date (90 days after a change). */
  previous: z.array(z.object({ address: z.string(), forward_until: when })).catch([]),
  /**
   * open; lapsed (the plan dropped it: readable 30 days); expired (export or
   * delete); reserved (the address is the club's, but its plan has no
   * mailbox: no mail is kept until it upgrades).
   */
  state: z.enum(["open", "lapsed", "expired", "reserved"]).catch("open"),
  lapsed_at: when,
  created_at: when,
  retention_months: z.coerce.number().nullish().default(null).catch(null),
  forwarding: count,
  threads: count,
  received: count,
  sent: count,
  spam: count,
  failed: count,
  received_this_month: count,
  sent_this_month: count,
  dropped_while_closed: count,
  last_received_at: when,
  last_sent_at: when,
});
export type ClubMailbox = z.infer<typeof clubMailboxSchema>;

export const STATE_TEXT: Record<ClubMailbox["state"], { label: string; tone: "success" | "warning" | "destructive" | "info" }> = {
  open: { label: "Open", tone: "success" },
  lapsed: { label: "Closed: plan lapsed", tone: "warning" },
  expired: { label: "Closed: export or delete", tone: "destructive" },
  reserved: { label: "Reserved: its plan has no mailbox", tone: "info" },
};

/** POST /admin/club-mailbox/backfill: how many clubs got (or would get) an address, how many already had one, a few of them. */
export const backfillSchema = z.object({
  dry_run: z.boolean().catch(true),
  created: count,
  skipped: count,
  failed: count,
  sample: z.array(z.object({ club_id: z.coerce.number(), handle: z.string() })).catch([]),
});
export type Backfill = z.infer<typeof backfillSchema>;

/** The handle's rules, as the server holds them (club_mailbox/handles.py), for a hint before asking. */
const HANDLE_RULE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export function handleProblem(value: string): string | null {
  const h = value.trim().toLowerCase();
  if (!h) return null;
  if (h.length < 3 || h.length > 30) return "An address is 3 to 30 characters.";
  if (!HANDLE_RULE.test(h)) return "Use letters, numbers, dots and hyphens, starting and ending with a letter or a number.";
  if (/[.-]{2}/.test(h)) return "No two dots or hyphens in a row.";
  return null;
}

/** What each refusal means, when the server gave no sentence of its own. */
export const MAILBOX_ERROR_TEXT: Record<string, string> = {
  HANDLE_INVALID: "Use 3 to 30 letters, numbers, dots and hyphens, starting and ending with a letter or a number.",
  HANDLE_RESERVED: "That address is kept for the platform. Pick another.",
  HANDLE_TAKEN: "That address is taken. Pick another.",
  INSUFFICIENT_ADMIN_ROLE: "Your admin role can't do this.",
  CLUB_NOT_FOUND: "That club isn't there any more.",
};
