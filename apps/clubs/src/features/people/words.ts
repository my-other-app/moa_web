import type { PrintState, Stage, Tone } from "./schemas";

/** The club's words for where a person stands (as the Review page says them). */
export const STAGE_WORDS: Record<Stage, string> = {
  under_review: "Under review",
  waitlisted: "On the waiting list",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  removed: "Removed",
};
export const STAGE_TONE: Record<Stage, "default" | "success" | "warning" | "destructive" | "info"> = {
  under_review: "warning",
  waitlisted: "info",
  confirmed: "success",
  declined: "destructive",
  cancelled: "default",
  removed: "destructive",
};

/**
 * What a card's state means to someone holding the guest list. "Printed" is
 * the only one that means a card is in hand; the rest are where it is stuck.
 */
export const PRINT_WORDS: Record<PrintState, string> = {
  queued: "Waiting for the print station",
  printing: "Printing",
  printed: "Printed",
  failed: "Did not print",
  cancelled: "Cancelled",
};
export const PRINT_TONE: Record<PrintState, "default" | "success" | "warning" | "destructive" | "info"> = {
  queued: "info",
  printing: "warning",
  printed: "success",
  failed: "destructive",
  cancelled: "default",
};

/** Who asked for a card when no person is named. */
export const PRINT_ASKED_BY: Record<string, string> = {
  kiosk: "self check-in kiosk",
  checkin: "on check-in",
  check_in: "on check-in",
  door: "the door",
  dashboard: "the dashboard",
  manual: "the dashboard",
  batch: "batch run",
  walkup: "walk-up",
};

export const CHECK_IN_WORDS: Record<string, string> = {
  qr: "QR code",
  scan: "QR code",
  manual: "by hand",
  by_hand: "by hand",
  hand: "by hand",
  kiosk: "kiosk",
  self: "phone self check-in",
  self_check_in: "phone self check-in",
  offline_sync: "synced from an offline door",
  walkup: "walk-up",
};

/** A provider's verdict in a word. */
export const OUTCOME_WORDS: Record<string, string> = {
  delivered: "Delivered",
  read: "Read",
  opened: "Opened",
  undelivered: "Not delivered",
  bounced: "Bounced",
  complained: "Marked as spam",
};
export const OUTCOME_TONE: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  delivered: "success",
  read: "success",
  opened: "success",
  undelivered: "warning",
  bounced: "destructive",
  complained: "destructive",
};

export const WHAT_WORDS: Record<string, string> = {
  ticket: "Ticket",
  certificate: "Certificate",
  review_email: "Review email",
  reminder: "Reminder",
};

const sentence = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};
export const whatWord = (w: string) => WHAT_WORDS[w] ?? sentence(w);
export const channelWord = (c: string | null) => (c === "email" ? "Email" : c === "whatsapp" ? "WhatsApp" : c ? sentence(c) : "Message");
export const methodWord = (m: string | null) => (m ? (CHECK_IN_WORDS[m.toLowerCase()] ?? m.replace(/_/g, " ")) : null);
export const askedBy = (source: string | null) => (source ? (PRINT_ASKED_BY[source.toLowerCase()] ?? source.replace(/_/g, " ")) : null);

/** The delivery's sentence: the provider's word outranks "we sent it". */
export function deliveryLine(d: { status: string | null; outcome: string | null; reason: string | null }) {
  const outcome = d.outcome?.toLowerCase() ?? null;
  const base = outcome ? (OUTCOME_WORDS[outcome] ?? sentence(outcome)) : d.status === "sent" ? "Sent, waiting to hear it arrived" : d.status === "failed" ? "Failed" : d.status === "skipped" ? "Skipped" : d.status ? sentence(d.status) : "Queued";
  const good = outcome === "delivered" || outcome === "read" || outcome === "opened";
  return d.reason && !good ? `${base} — ${d.reason}` : base;
}
export const deliveryTone = (d: { status: string | null; outcome: string | null }) =>
  d.outcome ? (OUTCOME_TONE[d.outcome.toLowerCase()] ?? "default") : d.status === "failed" ? "destructive" : d.status === "sent" ? "info" : d.status === "skipped" ? "default" : "warning";

/** Colours for a timeline row's tone (Meridian tokens, light and dark). */
export const TONE_CLASS: Record<Tone, string> = {
  default: "bg-sunken text-ink-3",
  success: "bg-admit-soft text-admit",
  warning: "bg-caution-soft text-caution",
  danger: "bg-refuse-soft text-refuse",
  info: "bg-brand-soft text-brand",
};
