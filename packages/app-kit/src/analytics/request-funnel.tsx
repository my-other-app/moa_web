"use client";

import * as React from "react";
import Link from "next/link";
import { CardLabel, FigurePanel, Notice, ProgressBar, cn } from "@moa/ui";

import { formatDateTime, formatNumber, plural, relativeTime } from "../format";
import type { Places, RequestFigures } from "./schemas";

/**
 * "Review registrations" in numbers: the registrations received, the ones
 * still under review, who was confirmed (and, on a paid event, who paid and
 * who is paying inside their hold), who was declined, cancelled or expired
 * (confirmed, not paid in time), and who came in. Then four rates and the
 * places as the server counts them (the ticket picker's own calculation, so
 * the two agree).
 *
 * Shared by the club's event overview and the admin's event page (read-only
 * there), and by the club's closeout. Everything comes from the server's
 * `requests` and `places`; nothing here is counted from rows.
 */

export interface RequestRates {
  /** Confirmed of everyone decided, in whole percent; null before anyone is decided. */
  confirmed: number | null;
  /** Paid of confirmed (a paid event only). */
  paid: number | null;
  /** Of those holding a ticket through a request, how many came in. */
  turnout: number | null;
  /** Of the people who opened the event page, how many registered. */
  asked: number | null;
}

const rate = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Whether the requests are for paid places: the caller's word, else what the figures show. */
function isPaid(r: RequestFigures, paidEvent: boolean | undefined): boolean {
  return paidEvent ?? (r.approved_paid > 0 || r.approved_awaiting_payment > 0 || r.lapsed > 0);
}

/**
 * The four rates. Confirmed counts everyone the club confirmed, including
 * those who then didn't pay (`lapsed`); decided adds the declined. Turnout
 * is against the people who hold a ticket: on a paid event, the ones who paid.
 */
export function requestRates(r: RequestFigures, opts: { paidEvent?: boolean; pageViews?: number | null } = {}): RequestRates {
  const paid = isPaid(r, opts.paidEvent);
  const confirmed = r.approved + r.lapsed;
  const holders = paid ? r.approved_paid : r.approved;
  return {
    confirmed: rate(confirmed, confirmed + r.declined),
    paid: paid ? rate(r.approved_paid, confirmed) : null,
    turnout: rate(r.checked_in, holders),
    asked: opts.pageViews ? rate(r.total, opts.pageViews) : null,
  };
}

/** How many registrations under review the places left can't take: 0 with no cap, or room for all. */
export function placesShortfall(places: Places | null | undefined, waiting: number): number {
  if (!places || places.left === null) return 0;
  return Math.max(0, waiting - places.left);
}

const pctText = (v: number | null) => (v === null ? "—" : `${v}%`);

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹2,388, ₹99.50: whole rupees without the paise. */
const rupees = (v: number) => (Number.isInteger(v) ? RUPEES : PAISE).format(v);

function hoursText(h: number): string {
  if (h < 1) return "under an hour";
  if (h < 48) return `about ${Math.round(h)} h`;
  return `about ${Math.round(h / 24)} days`;
}

interface Step {
  key: string;
  label: string;
  value: number;
  note?: string;
  tone: "accent" | "admit" | "caution" | "refuse" | "muted";
  sub?: { key: string; label: string; value: number; note?: string; tone: "admit" | "caution" | "refuse" }[];
}

function StepRow({ step, max }: { step: Step; max: number }) {
  return (
    <li className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-ink font-medium">{step.label}</span>
        <span className="text-ink font-mono text-[13px] tabular-nums">{formatNumber(step.value)}</span>
      </div>
      <ProgressBar value={step.value} max={max} tone={step.tone} height={7} label={`${step.label}: ${formatNumber(step.value)} of ${formatNumber(max)}`} />
      {step.note ? <span className="text-ink-3 text-[11.5px]">{step.note}</span> : null}
      {step.sub?.length ? (
        <ul className="border-line-soft mt-1 grid gap-1 border-l pl-3" aria-label={`${step.label}, split`}>
          {step.sub.map((s) => (
            <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", s.tone === "admit" ? "bg-admit" : s.tone === "caution" ? "bg-caution" : "bg-refuse")} />
                <span className="text-ink-2">{s.label}</span>
                <span className="text-ink font-mono tabular-nums">{formatNumber(s.value)}</span>
              </span>
              {s.note ? <span className="text-ink-3 text-[11.5px]">{s.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Rate({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-sunken min-w-0 rounded-xl px-3 py-2.5">
      <dt className="text-ink-3 truncate font-mono text-[10px] tracking-[0.06em] uppercase">{label}</dt>
      <dd className="m-0">
        <span className="text-ink block font-mono text-[18px] leading-tight tabular-nums">{value}</span>
        <span className="text-ink-3 block truncate text-[11px]">{note}</span>
      </dd>
    </div>
  );
}

/** Taken, held and left as one bar, with the words beside it. */
function PlacesBlock({ places, waiting, readOnly }: { places: Places; waiting: number; readOnly: boolean }) {
  const short = placesShortfall(places, waiting);
  const parts = [
    places.capacity === null ? "No cap" : `Capacity ${formatNumber(places.capacity)}`,
    `${formatNumber(places.taken)} taken`,
    `${formatNumber(places.held)} held`,
    places.left === null ? null : `${formatNumber(places.left)} left`,
    `${formatNumber(waiting)} under review`,
  ].filter(Boolean);
  const whole = places.capacity ?? places.taken + places.held;
  const share = (n: number) => (whole > 0 ? `${Math.min(100, (n / whole) * 100)}%` : "0%");
  return (
    <div className="border-line-soft grid gap-2 border-t px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardLabel>Places</CardLabel>
        <span className="text-ink-2 font-mono text-[12px] tabular-nums">{parts.join(" · ")}</span>
      </div>
      {whole > 0 ? (
        <div className="bg-sunken flex h-2 w-full overflow-hidden rounded-full" role="img" aria-label={parts.join(", ")}>
          <span className="bg-admit h-full" style={{ width: share(places.taken) }} />
          <span className="bg-caution h-full" style={{ width: share(places.held) }} />
        </div>
      ) : null}
      <p className="text-ink-3 m-0 text-[11.5px]">Held places are kept for people you confirmed until they pay. Registrations under review hold none.</p>
      {short > 0 ? (
        <Notice tone="caution" tag="Places">
          {plural(waiting, "registration is", "registrations are")} under review and {places.left === 0 ? "no place is" : `only ${plural(places.left ?? 0, "place is", "places are")}`} left.{" "}
          {readOnly ? "Confirming stops when the places run out." : "Confirming stops when the places run out: decline the rest, or add places under Settings."}
        </Notice>
      ) : null}
    </div>
  );
}

export function RequestFunnelCard({
  requests: r,
  places,
  paidEvent,
  pageViews,
  requestsHref,
  readOnly = false,
  title = "Registration review",
  now,
  className,
}: {
  requests: RequestFigures;
  /** The server's places; null hides the block (an older server, or the closeout). */
  places?: Places | null;
  /** A paid event: the confirmed split into paid, paying and didn't pay. Absent: read from the figures. */
  paidEvent?: boolean;
  /** The event page's views, for page views → registered. */
  pageViews?: number | null;
  /** Where the queue is, for the link in the corner. */
  requestsHref?: string;
  /** Someone who can't decide (the admin): no advice to act. */
  readOnly?: boolean;
  title?: string;
  /** The moment "oldest registered … ago" is read against (the server's generated_at). */
  now?: Date;
  className?: string;
}) {
  const at = now ?? new Date();
  const paid = isPaid(r, paidEvent);
  const rates = requestRates(r, { paidEvent: paid, pageViews });
  const max = Math.max(1, r.total);

  const steps: Step[] = [
    {
      key: "received",
      label: "Received",
      value: r.total,
      tone: "accent",
      note: r.added_directly > 0 ? `${plural(r.added_directly, "more person", "more people")} added directly (the desk, an import)` : undefined,
    },
    {
      key: "under_review",
      label: "Under review",
      value: r.pending,
      tone: r.pending > 0 ? "caution" : "muted",
      note: r.pending > 0 && r.oldest_pending_at ? `oldest registered ${relativeTime(r.oldest_pending_at, at)}` : r.pending > 0 ? undefined : "none left to review",
    },
    {
      key: "confirmed",
      label: "Confirmed",
      // Confirmed and still holding a ticket (or paying for it): the expired are counted with the declined.
      value: r.approved,
      tone: "admit",
      sub: paid
        ? [
            { key: "paid", label: "Paid", value: r.approved_paid, tone: "admit" },
            {
              key: "paying",
              label: "Paying",
              value: r.approved_awaiting_payment,
              tone: "caution",
              note:
                r.approved_awaiting_payment > 0
                  ? `${rupees(r.awaiting_payment_amount)} to come${r.earliest_hold_expires_at ? ` · first hold ends ${formatDateTime(r.earliest_hold_expires_at)}` : ""}`
                  : undefined,
            },
          ]
        : undefined,
    },
    {
      key: "declined",
      label: "Declined · Cancelled · Expired",
      value: r.declined + r.withdrawn + r.lapsed,
      tone: "muted",
      note: `${formatNumber(r.declined)} declined · ${formatNumber(r.withdrawn)} cancelled · ${formatNumber(r.lapsed)} expired (not paid in time)${r.closed > 0 ? ` · ${formatNumber(r.closed)} closed before review` : ""}`,
    },
    {
      key: "checked_in",
      label: "Checked in",
      value: r.checked_in,
      tone: "admit",
    },
  ];

  return (
    <FigurePanel className={cn("overflow-hidden p-0", className)} aria-label={title} role="region">
      <div className="border-line-soft flex items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>{title}</CardLabel>
        {requestsHref ? (
          <Link href={requestsHref} className="text-brand hover:text-ink text-[12px] font-medium">
            Open Review →
          </Link>
        ) : (
          <span className="text-ink-3 text-[11.5px]">{r.enabled ? "Reviews registrations" : "Reviewing registrations is off"}</span>
        )}
      </div>
      <div className="grid gap-4 px-4 py-3.5 lg:grid-cols-[1.35fr_1fr]">
        <ol className="m-0 grid list-none gap-3 p-0" aria-label="From registering to the door">
          {steps.map((s) => (
            <StepRow key={s.key} step={s} max={max} />
          ))}
        </ol>
        <div className="grid content-start gap-2">
          <dl className="m-0 grid grid-cols-2 gap-2" aria-label="Rates">
            <Rate label="Confirmed" value={pctText(rates.confirmed)} note={readOnly ? "of everyone reviewed" : "of everyone you reviewed"} />
            {paid ? <Rate label="Paid" value={pctText(rates.paid)} note="of everyone confirmed" /> : null}
            <Rate label="Turnout" value={pctText(rates.turnout)} note={paid ? "of the paid came in" : "of the confirmed came in"} />
            {rates.asked !== null ? <Rate label="Views → registered" value={pctText(rates.asked)} note={`of ${plural(pageViews ?? 0, "page view")}`} /> : null}
          </dl>
          {r.avg_decision_hours !== null ? (
            <p className="text-ink-3 m-0 text-[11.5px]">Average time to review: {hoursText(r.avg_decision_hours)}.</p>
          ) : null}
        </div>
      </div>
      {places ? <PlacesBlock places={places} waiting={r.pending} readOnly={readOnly} /> : null}
    </FigurePanel>
  );
}
