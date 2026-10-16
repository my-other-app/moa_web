"use client";

import Link from "next/link";
import { formatCurrency, formatNumber, formatWindow, pct } from "@moa/app-kit";
import { Skeleton, StatTile } from "@moa/ui";

import { useEventSummary } from "@/features/console";
import type { EventDetail } from "@/features/events";
import { useEventAnalytics } from "../queries";

/**
 * The four figures that open an event's Overview: who signed up, who is in,
 * who holds a ticket, and what the event brought — money for a paid event,
 * page views for a free one. Each leads to the page that acts on it.
 *
 * The door figures come from the live summary (the same response the door
 * panel reads, so the two can never disagree); the money and the view rate
 * from the sign-up analytics. While the door is open, "Checked in" is the
 * figure the page is about and takes the hero.
 */
export function EventStatCards({ eventId, event }: { eventId: number; event: EventDetail | undefined }) {
  const summary = useEventSummary(eventId);
  const analytics = useEventAnalytics(eventId);
  const s = summary.data;
  const a = analytics.data;
  const base = `/events/${eventId}`;

  if (!s) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[126px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const at = new Date(s.generated_at);
  const t = s.tickets;
  const left = s.capacity ? Math.max(0, s.capacity - s.registered) : null;
  const deleted = s.retention.state === "deleted";
  const ahead = !s.door_open && !s.from_report && s.checked_in === 0 && new Date(s.starts_at) > at;
  const paidEvent = !!event?.has_fee;
  const payment = a?.payment_status;

  const ticketNote = s.from_report
    ? "from the closeout report"
    : s.registered === 0
      ? "nothing to send until someone signs up"
      : s.status === "draft"
        ? "tickets go out once it is published"
        : t.missing > 0
          ? `of ${formatNumber(s.registered)} · ${formatNumber(t.missing)} still without one${t.pending ? ` · ${formatNumber(t.pending)} sending` : ""}`
          : `everyone on the list${t.revoked ? ` · ${formatNumber(t.revoked)} revoked` : ""}`;

  return (
    <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Registered"
        value={formatNumber(s.registered)}
        note={
          s.capacity && left !== null
            ? left === 0
              ? `full · capacity ${formatNumber(s.capacity)}`
              : `${formatNumber(left)} of ${formatNumber(s.capacity)} places left`
            : s.registered
              ? "no capacity set"
              : "nobody yet"
        }
        action={{ label: "Open the guest list", href: `${base}/attendees` }}
        linkAs={Link}
      />
      <StatTile
        label="Checked in"
        value={formatNumber(s.checked_in)}
        scale={s.door_open ? "hero" : "sm"}
        note={ahead ? `door opens ${formatWindow(s.starts_at, null, s.timezone)}` : `${pct(s.checked_in, s.registered)}% of the list${s.door_open ? " · door open" : ""}`}
        action={s.checked_in > 0 && !deleted ? { label: "See every check-in", href: `${base}/check-ins` } : undefined}
        linkAs={Link}
      />
      <StatTile
        label="Have a ticket"
        value={formatNumber(t.issued)}
        note={ticketNote}
        action={!s.from_report && t.missing > 0 && s.status !== "draft" ? { label: "Send the rest from the guest list", href: `${base}/attendees` } : undefined}
        linkAs={Link}
      />
      {paidEvent ? (
        <StatTile
          label="Collected"
          value={a ? formatCurrency(a.total_revenue) : "—"}
          note={
            payment
              ? payment.unpaid > 0
                ? `${formatNumber(payment.paid)} paid · ${formatNumber(payment.unpaid)} yet to pay`
                : `${formatNumber(payment.paid)} paid · nobody owes`
              : analytics.isError
                ? "could not load the money"
                : "ticket money taken"
          }
          action={{ label: "Open finance", href: `${base}/finance` }}
          linkAs={Link}
        />
      ) : (
        <StatTile
          label="Page views"
          value={formatNumber(event?.page_views ?? 0)}
          note={a ? `${Math.round(a.conversion_rate)}% of viewers signed up` : "people who opened the event page"}
          action={{ label: "See which links bring them", href: `${base}/links` }}
          linkAs={Link}
        />
      )}
    </section>
  );
}
