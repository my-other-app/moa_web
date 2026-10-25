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
  /** open; lapsed (the plan dropped it: readable 30 days); expired (export or delete). */
  state: z.enum(["open", "lapsed", "expired"]).catch("open"),
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

export const STATE_TEXT: Record<ClubMailbox["state"], { label: string; tone: "success" | "warning" | "destructive" }> = {
  open: { label: "Open", tone: "success" },
  lapsed: { label: "Closed: plan lapsed", tone: "warning" },
  expired: { label: "Closed: export or delete", tone: "destructive" },
};
