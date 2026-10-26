import type { EventLifecycle, EventSummary } from "@moa/app-kit";

export {
  eventSummarySchema,
  eventFiguresSchema,
  type EventSummary,
  type EventFigures,
  type RecentCheckIn,
} from "@moa/app-kit";

/**
 * The console's sections, in the order of an event's life: build the list,
 * run the door, follow up, close. Each is its own URL under the event.
 */
export const EVENT_TABS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "attendees", label: "Attendees", path: "/attendees" },
  // Confirm each registration: once the API has requests, and the event asks for them or has any.
  { key: "requests", label: "Requests", path: "/requests" },
  // Shown once the API has ticket types (event-console asks).
  { key: "tickets", label: "Tickets", path: "/tickets" },
  { key: "links", label: "Links", path: "/links" },
  { key: "finance", label: "Finance", path: "/finance" },
  // Each payment, with refunds (owners and admins; once the backend has club refunds).
  { key: "payments", label: "Payments", path: "/payments" },
  { key: "check-ins", label: "Check-ins", path: "/check-ins" },
  { key: "team", label: "Doors", path: "/team" },
  { key: "agenda", label: "Agenda", path: "/agenda" },
  { key: "live", label: "Live", path: "/live" },
  { key: "competition", label: "Competition", path: "/competition" },
  // 1st, 2nd and 3rd, per guest or per competition track (once the backend has results).
  { key: "results", label: "Results", path: "/results" },
  { key: "store", label: "Merchandise", path: "/store", when: "merch_enabled" },
  { key: "merch", label: "Swag", path: "/merch", when: "swag_enabled" },
  { key: "messages", label: "Messages", path: "/messages" },
  { key: "emails", label: "Emails", path: "/emails" },
  { key: "deliveries", label: "Deliveries", path: "/deliveries" },
  { key: "idcards", label: "ID cards", path: "/idcards" },
  { key: "certificates", label: "Certificates", path: "/certificates" },
  { key: "closeout", label: "Closeout", path: "/closeout" },
  { key: "settings", label: "Settings", path: "/edit" },
] as const;

export type EventTabKey = (typeof EVENT_TABS)[number]["key"];

/**
 * Sections that are one plan feature through and through. Without it the
 * tab carries a lock but still opens, so what is already there stays
 * readable (Live and Closeout hold free things too, so they lock inside).
 * All but Finance are event-scoped, so a grandfathered event shows no lock
 * on them; Finance writes the club's ledger and stays club-wide.
 */
export const TAB_FEATURE: Partial<Record<EventTabKey, string>> = {
  links: "links",
  finance: "finance",
  competition: "teams",
  store: "merch",
  merch: "swag",
  idcards: "badges",
};

/** Which tab the path under the event belongs to; "" on a sub-page that is not a tab. */
export function tabFor(rest: string): EventTabKey | "" {
  if (rest === "" || rest === "/") return "overview";
  return EVENT_TABS.find((t) => t.path && rest.startsWith(t.path))?.key ?? "";
}

export const DESIGN_LINKS = [
  { kind: "ticket", label: "Ticket", hint: "The PDF guests receive" },
  { kind: "badge", label: "ID card", hint: "Printed at the door and the kiosk" },
  { kind: "certificate", label: "Certificate", hint: "Issued after the event" },
  { kind: "agenda", label: "Programme", hint: "On the kiosk screens and printed as A4" },
] as const;

/** The standing notice for a status that changes what the console can do. */
export const STATUS_NOTICE: Partial<Record<EventLifecycle, string>> = {
  draft: "This event is a draft. The gate refuses check-ins and no tickets go out until you publish it under Close-out.",
  closed: "Closed. Settings are locked and the door is shut. The closeout report holds the final numbers.",
  archived: "Archived and hidden from the events list until somebody asks for archived events.",
  cancelled: "Cancelled. Registrations are closed, every guest was told, and online payments are refunded in full.",
};

/** Where each standing notice is settled: the one button beside it. */
export const STATUS_ACTION: Partial<Record<EventLifecycle, { label: string; path: string }>> = {
  draft: { label: "Publish under Close-out", path: "/closeout" },
  closed: { label: "Closeout report", path: "/closeout" },
};

export interface ClockNotice {
  tag: string;
  tone: "caution" | "refuse";
  body: string;
  /** The page that settles it, under the event. */
  action: { label: string; path: string };
}

/** The one-line notices the clock's state earns, beyond the standing one. */
export function clockNotices(s: Pick<EventSummary, "status" | "status_clock" | "starts_at" | "ends_at" | "retention">, now: Date): ClockNotice[] {
  const out: ClockNotice[] = [];
  if (!s.status_clock && s.status === "draft" && new Date(s.starts_at) < now) {
    out.push({
      tag: "Started",
      tone: "caution",
      body: "This event's start time has passed and it is still a draft, so the gate refuses every scan and no timed email goes out. Publish it, or switch the status clock on under Close-out.",
      action: { label: "Open Close-out", path: "/closeout" },
    });
  }
  if (!s.status_clock && (s.status === "published" || s.status === "live") && new Date(s.ends_at) < now) {
    out.push({
      tag: "Ended",
      tone: "caution",
      body: "This event has ended and its door is still open — anyone with a ticket can be checked in. Close it, or switch the status clock on under Close-out to have it close itself.",
      action: { label: "Open Close-out", path: "/closeout" },
    });
  }
  if (s.retention.state === "deleted") {
    out.push({
      tag: "Retention complete",
      tone: "refuse",
      body: "The guest list for this event was scrubbed after the closeout report was kept. The reports remain under Close-out; the figures here are the report's frozen copy.",
      action: { label: "See the reports", path: "/closeout" },
    });
  }
  return out;
}

/** One thing on the overview that wants a decision, and the page where it is made. */
export interface OverviewAttention {
  kind: string;
  tone: "red" | "amber";
  title: string;
  body: string;
  /** Under the event: "/attendees?delivery=not_delivered". */
  path: string;
}

const n = (count: number, one: string, many: string) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

/**
 * What on this event needs somebody now, from the summary alone: sends the
 * provider refused, guests without a ticket (or holding an old design),
 * people waiting for the club to confirm their registration, addresses that
 * bounced, ID cards that failed to print. Red before amber.
 * Once the list has been scrubbed there is nobody left to act on, so it is
 * empty; a draft sends no tickets by design, so a missing one is not news.
 */
export function overviewAttention(s: Pick<EventSummary, "status" | "from_report" | "tickets" | "analytics" | "requests_pending">): OverviewAttention[] {
  if (s.from_report) return [];
  const out: OverviewAttention[] = [];
  const failed = s.analytics.deliveries.reduce((sum, d) => sum + d.failed, 0);
  if (failed > 0) {
    out.push({
      kind: "SENDS_FAILED",
      tone: "red",
      title: `${n(failed, "ticket email", "ticket emails")} failed`,
      body: "The provider refused them. The delivery log says why; correct the address on the guest list and send again.",
      path: "/deliveries",
    });
  }
  const t = s.tickets;
  if (t.older_design > 0) {
    out.push({
      kind: "REDESIGNED_AFTER_ISSUE",
      tone: "amber",
      title: "Tickets redesigned after they went out",
      body: `${n(t.older_design, "guest holds", "guests hold")} a ticket made with an older design. Sending again is the only way to update them.`,
      path: "/attendees",
    });
  } else if (t.missing > 0 && s.status !== "draft") {
    out.push({
      kind: "TICKETS_MISSING",
      tone: "amber",
      title: `${n(t.missing, "guest", "guests")} without a ticket`,
      body: `${t.missing === 1 ? "No ticket has" : "No tickets have"} reached them yet. Send from the guest list; sending is safe to repeat.`,
      path: "/attendees",
    });
  }
  if (s.requests_pending > 0) {
    out.push({
      kind: "REQUESTS_PENDING",
      tone: "amber",
      title: `${n(s.requests_pending, "person", "people")} waiting for you to confirm`,
      body: "They filled the form and have no place yet. Their ticket goes out when you confirm them.",
      path: "/requests",
    });
  }
  const bounced = s.analytics.contacts.bounced;
  if (bounced > 0) {
    out.push({
      kind: "BOUNCED",
      tone: "amber",
      title: `${n(bounced, "email address", "email addresses")} bounced`,
      body: "Nothing more is sent to them until the address is corrected on the guest list.",
      path: "/attendees?delivery=not_delivered",
    });
  }
  if (s.analytics.cards.failed > 0) {
    out.push({
      kind: "CARDS_FAILED",
      tone: "amber",
      title: `${n(s.analytics.cards.failed, "ID card", "ID cards")} failed to print`,
      body: "Print them again from ID cards before the guest reaches the desk.",
      path: "/idcards",
    });
  }
  return out;
}
