"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrivalCurveCard,
  AttentionCard,
  EventAnalyticsPanels,
  formatCurrency,
  formatDate,
  formatNumber,
  formatWindow,
  pct,
  pickImage,
  relativeTime,
  timeUntil,
  type AttentionItem,
} from "@moa/app-kit";
import {
  Button,
  CardLabel,
  DefinitionRows,
  EmptyState,
  FigurePanel,
  InitialsAvatar,
  ProgressBar,
  RollingNumber,
  Skeleton,
} from "@moa/ui";

import type { EventDetail } from "@/features/events";
import { useEventSummary } from "../queries";
import { overviewAttention, type EventSummary, type OverviewAttention } from "../schemas";

/**
 * The event's Overview, laid out to answer two questions in order: how is
 * this event doing, and what needs me now.
 *
 * The headline figures first; then what wants a decision beside the door
 * itself (how many are in, who came through last, what was handed out);
 * then the door's figures once anyone has arrived — the curve, each door's
 * load, each role's turnout, whether tickets reached people, how guests
 * were admitted. Before the door opens the sign-ups come first instead,
 * because that is all there is to read. The event's own facts and the way
 * to reach its guests close the page, and what attendees said ends it.
 *
 * Everything here reads one summary response, refreshed every fifteen
 * seconds while the door is open — the counter rolls, never flashes. The
 * caller supplies what other features own (the figures that need the
 * sign-up analytics, the sign-ups, the composer, the reviews) as slots, so
 * the layout lives in one place.
 */
export function EventOverviewTab({
  eventId,
  event,
  figures,
  signups,
  notify,
  reviews,
  attention = [],
}: {
  eventId: number;
  event: EventDetail | undefined;
  /** The headline tiles. */
  figures?: React.ReactNode;
  /** When and from where people signed up. */
  signups?: React.ReactNode;
  /** The way to reach the guests. */
  notify?: React.ReactNode;
  /** What attendees said. */
  reviews?: React.ReactNode;
  /** What the caller can see that the summary cannot (unpaid sign-ups), merged into what needs attention. */
  attention?: OverviewAttention[];
}) {
  const summary = useEventSummary(eventId);
  const s = summary.data;
  const base = `/events/${eventId}`;

  if (summary.isError) {
    return (
      <FigurePanel>
        <EmptyState
          size="sm"
          title="The event's figures could not load"
          description="Everything else on the event still works. Try again in a moment."
          action={
            <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
              Try again
            </Button>
          }
        />
      </FigurePanel>
    );
  }
  if (!s) return <OverviewSkeleton />;

  const needs = [...overviewAttention(s), ...(s.from_report ? [] : attention)]
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1))
    .slice(0, 6);
  const paths = new Map(needs.map((a) => [a.kind, `${base}${a.path}`]));
  const items: AttentionItem[] = needs.map((a) => ({ kind: a.kind, tone: a.tone, title: a.title, body: a.body, event_id: eventId }));
  // Before anyone is through the door its figures are empty panels; the sign-ups lead instead.
  const arrived = s.from_report || s.analytics.total_admitted > 0;
  const doorFigures = (
    <div className="grid gap-3 lg:grid-cols-2">
      <EventAnalyticsPanels
        a={s.analytics}
        timezone={s.timezone}
        fromReport={s.from_report}
        registered={s.registered}
        doorOpen={s.door_open}
        teamHref={`${base}/team`}
        messagesHref={() => `${base}/messages`}
      />
    </div>
  );

  return (
    <div className="grid gap-5">
      {figures}

      <section className="grid gap-3 lg:grid-cols-2">
        <AttentionCard
          items={items}
          hrefFor={(item) => paths.get(item.kind) ?? null}
          allClear={
            s.from_report
              ? "The guest list is gone, so there is nothing left to act on. The closeout report holds the final numbers."
              : s.registered === 0
                ? "Nothing needs you yet. Once people sign up, anything that goes wrong with their tickets shows here."
                : s.status === "draft"
                  ? "Nothing needs you right now. Tickets go out once the event is published."
                  : "Nothing needs you right now. Tickets have gone out, nothing failed and no address bounced."
          }
        />
        <DoorPanel s={s} base={base} />
      </section>

      {arrived ? (
        <>
          <ArrivalCurveCard a={s.analytics} startsAt={s.starts_at} timezone={s.timezone} fromReport={s.from_report} />
          {doorFigures}
        </>
      ) : null}

      {signups}

      {arrived ? null : doorFigures}

      <section className={notify ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
        <AboutPanel s={s} event={event} base={base} />
        {notify}
      </section>

      {reviews}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[126px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </div>
      <Skeleton className="h-[220px] rounded-2xl" />
    </div>
  );
}

/**
 * The door as it stands: how many are in against the list and the room,
 * how the list was made, who came through last, and the swag handed out.
 * Times are read against the moment the server drew the figures, so they
 * move with each refresh rather than with a clock the page keeps.
 */
function DoorPanel({ s, base }: { s: EventSummary; base: string }) {
  const at = new Date(s.generated_at);
  const deleted = s.retention.state === "deleted";
  const turnout = pct(s.checked_in, s.registered);
  const ahead = !s.door_open && !s.from_report && s.checked_in === 0 && new Date(s.starts_at) > at;
  const sources = s.by_source.filter((b) => b.registered > 0);

  return (
    <FigurePanel className="flex min-w-0 flex-col overflow-hidden p-0">
      <div className="border-line-soft flex items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>The door</CardLabel>
        {s.door_open ? (
          <span className="text-admit flex items-center gap-1.5 text-[11.5px] font-medium">
            <span aria-hidden="true" className="bg-admit size-[6px] rounded-full [animation:pulse-ring_2.4s_infinite] motion-reduce:[animation:none]" />
            Open · live
          </span>
        ) : (
          <span className="text-ink-3 text-[11.5px]">{s.from_report ? "From the closeout report" : ahead ? `Opens in ${timeUntil(s.starts_at, at)}` : "Shut"}</span>
        )}
      </div>

      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-baseline gap-2">
          <RollingNumber value={formatNumber(s.checked_in)} className="text-ink font-mono text-[34px] leading-none tracking-[-0.03em]" />
          <span className="text-ink-3 font-mono text-[14px] tabular-nums">/ {formatNumber(s.registered)}</span>
          <span className="flex-1" />
          <span className="text-admit font-mono text-[13px] font-medium tabular-nums">{turnout}%</span>
        </div>
        <ProgressBar value={s.checked_in} max={s.registered} tone="admit" height={10} className="mt-3" label="Checked in" />
        <p className="text-ink-3 mt-2 text-[12px]">
          {s.capacity ? `Capacity ${formatNumber(s.capacity)} · the room is ${pct(s.checked_in, s.capacity)}% full` : "No capacity set."}
        </p>
        {sources.length > 1 ? (
          <dl className="mt-2.5 grid gap-1">
            {sources.map((b) => (
              <div key={b.source} className="flex items-baseline justify-between gap-2 text-[12px]">
                <dt className="text-ink-2">{b.label}</dt>
                <dd className="text-ink-3 m-0 font-mono tabular-nums">
                  {formatNumber(b.checked_in)} of {formatNumber(b.registered)} in
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="border-line-soft flex-1 border-t">
        <p className="eyebrow px-4 pt-3 pb-1">Recent check-ins</p>
        {s.recent.length === 0 ? (
          <p className="text-ink-3 px-4 pt-1 pb-4 text-[12.5px]">
            {deleted
              ? `The ${formatNumber(s.checked_in)} admissions live on in the closeout report.`
              : ahead
                ? `Nobody yet. The door opens with the event, ${formatWindow(s.starts_at, null, s.timezone)}.`
                : "Nobody has come through the door yet."}
          </p>
        ) : (
          <ul>
            {s.recent.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 px-4 py-2 [animation:fade-up_220ms_ease-out_both] motion-reduce:[animation:none]">
                <InitialsAvatar name={c.name} size={24} tone="admit" />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[12.5px] font-medium">{c.name}</span>
                  <span className="text-ink-3 block truncate text-[11.5px]">
                    {c.door}
                    {c.by ? ` · ${c.by}` : ""}
                  </span>
                </span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px]">{relativeTime(c.checked_in_at, at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {s.merch.length ? (
        <div className="border-line-soft border-t px-4 py-3">
          <CardLabel
            right={
              <Link href={`${base}/merch`} className="text-brand hover:text-ink text-[11.5px] font-medium">
                Swag
              </Link>
            }
          >
            Swag handed out
          </CardLabel>
          <ul className="mt-2 grid gap-2">
            {s.merch.map((m) => (
              <li key={m.item_id}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="text-ink truncate">{m.name}</span>
                  <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                    {formatNumber(m.collected)} / {formatNumber(m.total)}
                  </span>
                </div>
                <ProgressBar value={m.collected} max={m.total} height={6} className="mt-1" label={`${m.name} collected`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.checked_in > 0 && !deleted ? (
        <Link href={`${base}/check-ins`} className="border-line-soft text-brand hover:bg-sunken hover:text-ink block border-t px-4 py-2.5 text-[12px] font-medium transition-colors">
          View all {formatNumber(s.checked_in)} check-ins →
        </Link>
      ) : null}
    </FigurePanel>
  );
}

/** The event's own facts: the poster and the words that front it, where and when, what entry costs, what happens to the guest list. */
function AboutPanel({ s, event, base }: { s: EventSummary; event: EventDetail | undefined; base: string }) {
  const poster = pickImage(event?.poster, ["medium", "large", "original", "thumbnail"]);
  const at = new Date(s.generated_at);
  const closes = event?.reg_enddate ? new Date(event.reg_enddate) : null;
  const signups = !closes || Number.isNaN(closes.getTime()) ? "Open until the event starts" : closes > at ? `Open until ${formatDate(closes)}` : `Closed ${formatDate(closes)}`;
  const guestData =
    s.retention.state === "deleted"
      ? "Scrubbed; the closeout report remains"
      : s.retention.mode === "delete"
        ? "Scrubbed after the event, once the report has gone out"
        : "Kept after the event";

  return (
    <FigurePanel>
      <CardLabel
        className="mb-3"
        right={
          <Link href={`${base}/edit`} className="text-brand hover:text-ink text-[12px] font-medium">
            Edit details →
          </Link>
        }
      >
        About
      </CardLabel>
      <div className="mb-3 flex items-start gap-3">
        {/* The poster, small: it fronts the public page, the ticket and the app. */}
        <div className="bg-sunken border-line-soft relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-xl border">
          {poster ? (
            <Image src={poster} alt={`Poster for ${event?.name ?? "this event"}`} fill sizes="72px" className="object-cover" unoptimized />
          ) : (
            <span className="text-ink-3 px-1 text-center text-[10.5px] leading-tight">No poster</span>
          )}
        </div>
        <p className="text-ink-2 line-clamp-4 min-w-0 flex-1 text-[12.5px] leading-[1.55]">
          {event?.about || "No description yet. The poster and the description front the public page and the app; add them under Settings."}
        </p>
      </div>
      <DefinitionRows
        rows={[
          { k: "Club", v: event?.club?.name ?? "—" },
          { k: "Venue", v: event?.is_online ? "Online" : event?.location_name || "—" },
          { k: "Runs", v: formatWindow(s.starts_at, s.ends_at, s.timezone) },
          { k: "Entry", v: event?.has_fee && event.reg_fee ? formatCurrency(event.reg_fee) : "Free" },
          { k: "Capacity", v: s.capacity ? formatNumber(s.capacity) : "Unlimited" },
          { k: "Sign-ups", v: signups },
          { k: "Guest data", v: guestData },
        ]}
      />
    </FigurePanel>
  );
}
