"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarPlusIcon,
  DoorOpenIcon,
  LockIcon,
  MapPinIcon,
  PlusIcon,
} from "lucide-react";
import { formatNumber, useListParams } from "@moa/app-kit";
import { pageCount } from "@moa/api";
import {
  Chip,
  cn,
  EmptyState,
  FigurePanel,
  Notice,
  Pager,
  ProgressBar,
  SearchField,
  Skeleton,
  StatTile,
} from "@moa/ui";

import { LimitMeter, useLimitGate } from "@/features/plan";

import { useClubEvents, useEventsFigures } from "../queries";
import {
  EVENT_SCOPES,
  EVENT_SORTS,
  type ClubEvent,
  type EventScope,
  type EventSort,
  type EventsFigures,
} from "../schemas";
import { EventRowMenu } from "./event-row-menu";
import { EventStatusBadge } from "./event-status-badge";

/**
 * The events page, rebuilt around what an organiser opens it to learn.
 *
 * One line on the season and four figures; what waits on somebody; then the
 * list, scoped (upcoming · happening now · drafts · past) and grouped by
 * when. Each row carries the date as a block, the name and where, and the
 * figures the row is checked for — in and of how many, came, collected,
 * views to sign-ups — with one primary action for the state it is in and
 * everything else behind a menu. Delete is no longer a click on the row.
 */
const PAGE_SIZE = 20;
const TZ = "Asia/Kolkata";

const SCOPE_LABEL: Record<EventScope, string> = {
  upcoming: "Upcoming",
  now: "Happening now",
  draft: "Drafts",
  past: "Past",
  all: "All",
};
const SORT_LABEL: Record<EventSort, string> = {
  soonest: "Soonest first",
  latest: "Latest first",
  registered: "Most registered",
  viewed: "Most viewed",
};
const DAY = 86_400_000;

function inr(value: number): string {
  return `₹${formatNumber(Math.round(value))}`;
}

function at(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "in 2 days", "in 3 hours", "today", "yesterday", "3 weeks ago". */
export function relativeDay(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  const t = at(iso);
  if (t === null) return "";
  const diff = t - now;
  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 1) return "now";
  if (Math.abs(hours) < 24)
    return hours > 0 ? `in ${hours}h` : `${-hours}h ago`;
  const days = Math.round(diff / DAY);
  if (Math.abs(days) < 7) return days > 0 ? `in ${days}d` : `${-days}d ago`;
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 5) return weeks > 0 ? `in ${weeks}w` : `${-weeks}w ago`;
  const months = Math.round(days / 30);
  return months > 0 ? `in ${months}mo` : `${-months}mo ago`;
}

/** Which bucket a row sits under: by nearness ahead, by month behind. */
export function groupOf(
  event: ClubEvent,
  scope: EventScope,
  now = Date.now(),
): string {
  const start = at(event.event_datetime);
  if (start === null) return "Undated";
  if (scope === "past" || (scope === "all" && start < now)) {
    return new Date(start).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: TZ,
    });
  }
  if (event.door_open || event.status === "live") return "Happening now";
  const days = (start - now) / DAY;
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return "Later";
}

/** The one line under the name that says what is true about sign-up right now. */
export function signalOf(
  event: ClubEvent,
  now = Date.now(),
): { text: string; tone: "admit" | "caution" | "refuse" | "muted" } | null {
  const start = at(event.event_datetime);
  const end = at(event.ends_at) ?? start;
  if (event.status === "draft")
    return { text: "Draft — not public yet", tone: "caution" };
  if (event.door_open) return { text: "Doors open", tone: "admit" };
  if (end !== null && end < now) {
    if (
      (event.registration_count ?? 0) > 0 &&
      (event.checked_in ?? 0) === 0 &&
      (event.attended_count ?? 0) === 0
    )
      return { text: "Attendance not marked", tone: "caution" };
    return null;
  }
  if (
    event.max_participants &&
    (event.registration_count ?? 0) >= event.max_participants
  )
    return { text: "Full", tone: "admit" };
  if (event.registration_open) {
    const closes = at(event.reg_enddate);
    if (closes !== null && closes - now < 2 * DAY)
      return {
        text: `Sign-up closes ${relativeDay(event.reg_enddate, now)}`,
        tone: "caution",
      };
    return { text: "Sign-up open", tone: "muted" };
  }
  const opens = at(event.reg_startdate);
  if (opens !== null && opens > now)
    return {
      text: `Sign-up opens ${relativeDay(event.reg_startdate, now)}`,
      tone: "muted",
    };
  return { text: "Sign-up closed", tone: "refuse" };
}

/** The one thing to do with the row, by the state it is in. */
function primaryOf(
  event: ClubEvent,
  now = Date.now(),
): { label: string; href: string } {
  const end = at(event.ends_at) ?? at(event.event_datetime);
  if (event.status === "draft")
    return { label: "Finish setup", href: `/events/${event.id}/edit` };
  if (event.door_open) return { label: "Open gate", href: `/gate/${event.id}` };
  if (end !== null && end < now)
    return { label: "Closeout", href: `/events/${event.id}/closeout` };
  return { label: "Open console", href: `/events/${event.id}` };
}

const TONE_TEXT = {
  admit: "text-admit",
  caution: "text-caution",
  refuse: "text-refuse",
  muted: "text-ink-3",
} as const;

function DateBlock({ iso }: { iso: string | null | undefined }) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return (
      <span className="bg-sunken text-ink-3 grid size-14 shrink-0 place-items-center rounded-xl text-[11px]">
        TBD
      </span>
    );
  }
  return (
    <span
      className="bg-sunken grid size-14 shrink-0 place-items-center rounded-xl text-center leading-none"
      aria-hidden="true"
    >
      <span className="text-ink block font-mono text-[20px] font-semibold tabular-nums">
        {d.toLocaleDateString("en-IN", { day: "2-digit", timeZone: TZ })}
      </span>
      <span className="text-ink-3 block font-mono text-[10px] tracking-[0.08em] uppercase">
        {d.toLocaleDateString("en-IN", { month: "short", timeZone: TZ })}
      </span>
    </span>
  );
}

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-[72px]">
      <div className="text-ink font-mono text-[15px] font-semibold tabular-nums">
        {value}
      </div>
      <div className="text-ink-3 text-[10.5px] tracking-[0.04em] uppercase">
        {label}
      </div>
      {sub ? <div className="text-ink-3 text-[11px]">{sub}</div> : null}
    </div>
  );
}

export function EventRow({ event, now }: { event: ClubEvent; now: number }) {
  const start = at(event.event_datetime);
  const ended = (at(event.ends_at) ?? start ?? Infinity) < now;
  const regs = event.registration_count ?? 0;
  const views = event.page_views ?? 0;
  const conversion = views > 0 ? Math.round((100 * regs) / views) : null;
  const signal = signalOf(event, now);
  const primary = primaryOf(event, now);
  const when =
    start === null
      ? "Date to be set"
      : new Date(start).toLocaleString("en-IN", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: TZ,
        });
  return (
    <li
      className={cn(
        "bg-surface border-line-soft shadow-card flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border p-4",
        event.door_open && "border-admit-line",
      )}
    >
      <DateBlock iso={event.event_datetime} />
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${event.id}`}
            className="text-ink truncate text-[15px] font-semibold tracking-[-0.01em] hover:underline"
          >
            {event.name}
          </Link>
          <EventStatusBadge status={event.status} />
        </div>
        <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          <span>
            {when}
            {start !== null ? (
              <span className="text-ink-3">
                {" "}
                · {relativeDay(event.event_datetime, now)}
              </span>
            ) : null}
          </span>
          {event.location_name || event.is_online ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {event.is_online ? "Online" : event.location_name}
              </span>
            </span>
          ) : null}
          <span>
            {/* A paid event without its price (a server from before the
                list carried reg_fee) still reads as paid, never "Free". */}
            {event.has_fee
              ? event.reg_fee
                ? `${inr(event.reg_fee)} entry`
                : "Paid"
              : "Free"}
          </span>
          {event.category?.name ? (
            <span className="text-ink-3">{event.category.name}</span>
          ) : null}
        </div>
        {signal ? (
          <div
            className={cn(
              "mt-1 text-[12px] font-medium",
              TONE_TEXT[signal.tone],
            )}
          >
            {signal.text}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div className="w-[96px]">
          <Figure
            label={
              event.max_participants
                ? `of ${formatNumber(event.max_participants)}`
                : "registered"
            }
            value={formatNumber(regs)}
          />
          {event.max_participants ? (
            <ProgressBar
              value={regs}
              max={event.max_participants}
              tone={regs >= event.max_participants ? "admit" : "accent"}
              className="mt-1"
            />
          ) : null}
        </div>
        {ended || event.door_open ? (
          <Figure
            label="came"
            value={formatNumber(event.checked_in ?? 0)}
            sub={
              regs > 0
                ? `${Math.round((100 * (event.checked_in ?? 0)) / regs)}%`
                : undefined
            }
          />
        ) : (
          <Figure
            label="views"
            value={formatNumber(views)}
            sub={conversion === null ? undefined : `${conversion}% sign up`}
          />
        )}
        {event.has_fee || event.collected > 0 ? (
          <Figure
            label="collected"
            value={inr(event.collected)}
            sub={
              event.outstanding > 0
                ? `${inr(event.outstanding)} owed`
                : undefined
            }
          />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={primary.href}
          className={cn(
            "btn btn-secondary btn-sm",
            event.door_open ? "btn-primary" : "btn-secondary",
          )}
        >
          {event.door_open ? <DoorOpenIcon className="size-3.5" /> : null}
          {primary.label}
        </Link>
        <EventRowMenu event={event} />
      </div>
    </li>
  );
}

function Season({ f, now }: { f: EventsFigures; now: number }) {
  const waits =
    f.attention.closing_soon.length +
    f.attention.doors_open.length +
    f.attention.unmarked.length +
    f.attention.stale_drafts.length;
  const next = f.next_event
    ? `next ${relativeDay(f.next_event.starts_at, now)}`
    : "nothing scheduled";
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Upcoming"
        value={formatNumber(f.upcoming)}
        note={next}
        action={
          f.next_event
            ? { label: f.next_event.name, href: `/events/${f.next_event.id}` }
            : undefined
        }
        linkAs={Link}
      />
      <StatTile
        label="Registered"
        value={formatNumber(f.registered)}
        note={
          f.capacity
            ? `of ${formatNumber(f.capacity)} places`
            : `across ${f.upcoming} upcoming`
        }
      />
      <StatTile
        label="Collected"
        value={inr(f.collected)}
        note={
          f.outstanding > 0
            ? `${inr(f.outstanding)} still owed`
            : "for upcoming events"
        }
      />
      <StatTile
        label="Waiting on you"
        value={formatNumber(waits)}
        note={waits === 0 ? "nothing right now" : "see below"}
        scale={waits > 0 ? "hero" : "sm"}
      />
    </div>
  );
}

function Attention({ f, now }: { f: EventsFigures; now: number }) {
  const items: {
    key: string;
    tone: "admit" | "caution" | "refuse";
    tag: string;
    text: React.ReactNode;
    href: string;
    action: string;
  }[] = [];
  for (const e of f.attention.doors_open)
    items.push({
      key: `d${e.id}`,
      tone: "admit",
      tag: "Now",
      text: (
        <>
          Doors are open at <strong>{e.name}</strong>.
        </>
      ),
      href: `/gate/${e.id}`,
      action: "Open gate",
    });
  for (const e of f.attention.closing_soon)
    items.push({
      key: `c${e.id}`,
      tone: "caution",
      tag: "Closing",
      text: (
        <>
          Sign-up for <strong>{e.name}</strong> closes {relativeDay(e.at, now)}.
        </>
      ),
      href: `/events/${e.id}/links`,
      action: "Share links",
    });
  for (const e of f.attention.unmarked)
    items.push({
      key: `u${e.id}`,
      tone: "caution",
      tag: "Attendance",
      text: (
        <>
          Nobody was marked present at <strong>{e.name}</strong>, so
          certificates cannot go out.
        </>
      ),
      href: `/events/${e.id}/attendees`,
      action: "Mark attendance",
    });
  for (const e of f.attention.stale_drafts)
    items.push({
      key: `s${e.id}`,
      tone: "refuse",
      tag: "Draft",
      text: (
        <>
          <strong>{e.name}</strong> is {relativeDay(e.at, now)} and still a
          draft.
        </>
      ),
      href: `/events/${e.id}/edit`,
      action: "Finish setup",
    });
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2">
      {items.slice(0, 4).map((i) => (
        <Notice
          key={i.key}
          tone={i.tone}
          tag={i.tag}
          action={
            <Link href={i.href} className="btn btn-secondary btn-sm">
              {i.action}
            </Link>
          }
        >
          {i.text}
        </Notice>
      ))}
    </div>
  );
}

export function ClubEventsList() {
  const router = useRouter();
  const params = useListParams({ pageSize: PAGE_SIZE });
  const search = useSearchParams();
  const scopeParam = search.get("scope");
  const sortParam = search.get("sort");
  const scope: EventScope = (EVENT_SCOPES as readonly string[]).includes(
    scopeParam ?? "",
  )
    ? (scopeParam as EventScope)
    : "upcoming";
  const sort: EventSort | undefined = (
    EVENT_SORTS as readonly string[]
  ).includes(sortParam ?? "")
    ? (sortParam as EventSort)
    : undefined;
  const [now] = React.useState(() => Date.now());

  const figures = useEventsFigures();
  // At the month's cap, "New event" opens the upgrade dialog rather than a form that cannot be saved.
  const monthly = useLimitGate("events_per_month");
  const newEvent = monthly.guard(() => router.push("/events/new"));
  const events = useClubEvents({
    search: params.search || undefined,
    scope,
    sort,
    offset: (params.page - 1) * params.pageSize,
    limit: params.pageSize,
  });

  const set = (key: string, value: string) =>
    params.setParam(key, value || undefined);
  const total = events.data?.total ?? 0;
  const rows = events.data?.items ?? [];
  const counts: Partial<Record<EventScope, number>> = figures.data
    ? {
        upcoming: figures.data.upcoming,
        now: figures.data.attention.doors_open.length,
        draft: figures.data.drafts,
        past: figures.data.past,
      }
    : {};

  const groups: { label: string; items: ClubEvent[] }[] = [];
  for (const e of rows) {
    const label =
      sort && sort !== "soonest" && sort !== "latest"
        ? ""
        : groupOf(e, scope, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {figures.data
              ? `${figures.data.upcoming} upcoming · ${formatNumber(figures.data.registered)} registered · ${inr(figures.data.collected)} collected${figures.data.past ? ` · ${figures.data.past} past` : ""}`
              : "Everything your club runs, past and next."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LimitMeter limitKey="events_per_month" />
          {monthly.locked ? (
            <button type="button" className="btn btn-primary" onClick={monthly.prompt}>
              <LockIcon className="size-4" /> New event
            </button>
          ) : (
            <Link href="/events/new" className="btn btn-primary">
              <PlusIcon className="size-4" /> New event
            </Link>
          )}
        </div>
      </div>

      {figures.isPending ? (
        <Skeleton className="h-[108px]" />
      ) : figures.data ? (
        <Season f={figures.data} now={now} />
      ) : null}
      {figures.data ? <Attention f={figures.data} now={now} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Which events"
        >
          {EVENT_SCOPES.map((s) => (
            <Chip
              key={s}
              active={scope === s}
              onClick={() => set("scope", s === "upcoming" ? "" : s)}
            >
              {SCOPE_LABEL[s]}
              {counts[s] ? ` ${counts[s]}` : ""}
            </Chip>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchField
            value={params.searchInput}
            onChange={params.setSearchInput}
            onCommit={params.commitSearch}
            placeholder="Search events"
            label="Search events"
            className="sm:w-56"
          />
          <select
            className="input"
            aria-label="Sort"
            value={sort ?? (scope === "past" ? "latest" : "soonest")}
            onChange={(e) =>
              set(
                "sort",
                e.target.value === (scope === "past" ? "latest" : "soonest")
                  ? ""
                  : e.target.value,
              )
            }
          >
            {EVENT_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {events.isPending ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : events.isError ? (
        <EmptyState
          tone="muted"
          title="Events could not load"
          description="Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <FigurePanel className="p-8">
          <EmptyState
            tone="muted"
            icon={<CalendarPlusIcon className="size-6" />}
            title={
              params.search
                ? "Nothing matches that search"
                : scope === "upcoming"
                  ? "Nothing coming up"
                  : scope === "now"
                    ? "No doors open right now"
                    : scope === "draft"
                      ? "No drafts"
                      : scope === "past"
                        ? "Nothing has run yet"
                        : "No events yet"
            }
            description={
              params.search
                ? "Try another word, or widen the scope."
                : scope === "upcoming" || scope === "all"
                  ? "Create an event and it appears here with its sign-ups, money and a countdown."
                  : scope === "now"
                    ? "An event shows here from a day before it starts while its gate is open."
                    : undefined
            }
            action={
              scope === "upcoming" || scope === "all" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={newEvent}
                >
                  Create an event
                </button>
              ) : undefined
            }
          />
        </FigurePanel>
      ) : (
        <div className="grid gap-5">
          {groups.map((g, i) => (
            <section key={`${g.label}-${i}`} aria-label={g.label || "Events"}>
              {g.label ? <h2 className="eyebrow mb-2">{g.label}</h2> : null}
              <ul className="grid gap-3">
                {g.items.map((e) => (
                  <EventRow key={e.id} event={e} now={now} />
                ))}
              </ul>
            </section>
          ))}
          <Pager
            page={params.page}
            pageCount={pageCount(total, params.pageSize) ?? 1}
            total={total}
            pageSize={params.pageSize}
            noun={["event", "events"]}
            onPage={params.setPage}
            onPageSize={params.setPageSize}
            busy={events.isFetching}
          />
        </div>
      )}
    </div>
  );
}
