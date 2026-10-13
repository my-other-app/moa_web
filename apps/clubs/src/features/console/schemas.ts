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
  { key: "links", label: "Links", path: "/links" },
  { key: "finance", label: "Finance", path: "/finance" },
  { key: "check-ins", label: "Check-ins", path: "/check-ins" },
  { key: "team", label: "Doors", path: "/team" },
  { key: "agenda", label: "Agenda", path: "/agenda" },
  { key: "live", label: "Live", path: "/live" },
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
};

/** The one-line notices the clock's state earns, beyond the standing one. */
export function clockNotices(s: Pick<EventSummary, "status" | "status_clock" | "starts_at" | "ends_at" | "retention">, now: Date): { tag: string; tone: "caution" | "refuse"; body: string }[] {
  const out: { tag: string; tone: "caution" | "refuse"; body: string }[] = [];
  if (!s.status_clock && s.status === "draft" && new Date(s.starts_at) < now) {
    out.push({ tag: "Started", tone: "caution", body: "This event's start time has passed and it is still a draft, so the gate refuses every scan and no timed email goes out. Publish it, or switch the status clock on under Close-out." });
  }
  if (!s.status_clock && (s.status === "published" || s.status === "live") && new Date(s.ends_at) < now) {
    out.push({ tag: "Ended", tone: "caution", body: "This event has ended and its door is still open — anyone with a ticket can be checked in. Close it, or switch the status clock on under Close-out to have it close itself." });
  }
  if (s.retention.state === "deleted") {
    out.push({ tag: "Retention complete", tone: "refuse", body: "The guest list for this event was scrubbed after the closeout report was kept. The reports remain under Close-out; the figures here are the report's frozen copy." });
  }
  return out;
}
