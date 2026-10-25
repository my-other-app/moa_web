"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, ChevronDownIcon, LockIcon, PaletteIcon, ScanLineIcon } from "lucide-react";
import { formatWindow, pickImage } from "@moa/app-kit";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Notice,
  Skeleton,
  TabPanel,
  TabRail,
  cn,
} from "@moa/ui";
import { enter } from "@moa/ui/motion";

import { useAccess } from "@/features/access";
import { CancelEventDialog, useCancelState } from "@/features/event-cancel";
import { useResults } from "@/features/results";
import { EventRowMenu, EventStatusBadge, useEventDetail } from "@/features/events";
import { useEventPlan, usePlan } from "@/features/plan";
import { useTicketTypes } from "@/features/ticketing/queries";
import { useEventSummary } from "../queries";
import { DESIGN_LINKS, EVENT_TABS, STATUS_ACTION, STATUS_NOTICE, TAB_FEATURE, clockNotices, tabFor } from "../schemas";

/**
 * The operational heart of an event: its name and status, the one-line
 * notices its clock earns (each with the one place that settles it), the
 * actions that are always wanted, and a rail of sections in the order of the
 * event's life. Every page under the event renders inside it; the designer
 * is the exception, because it wants the whole width and its own tabs.
 *
 * One primary action at most: the gate console, and only while the door is
 * open — the gate refuses check-ins while it is shut. Everything else that
 * acts on the event as a whole sits behind the one "More" menu the events
 * list uses, so a row and its page offer the same verbs.
 */
/** A section's name, with a lock when the plan does not include it. */
function TabLabel({ label, lock }: { label: string; lock: { requiredPlanName: string | null } | null }) {
  if (!lock) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1" title={`Part of ${lock.requiredPlanName ?? "a bigger plan"} and up`}>
      {label}
      <LockIcon role="img" aria-label="Locked" className="text-ink-3 size-3" />
    </span>
  );
}

export function EventConsole({ eventId, children }: { eventId: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/events/${eventId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const bare = rest.startsWith("/design");
  const event = useEventDetail(eventId);
  const { can } = useAccess();
  const summary = useEventSummary(eventId);
  // Sections and actions whose backend may not be deployed yet: each read answers null on an API
  // without its route, and the section stays out until it has one. Cancelling and refunds are money.
  const results = useResults(eventId);
  const cancelState = useCancelState(eventId, can.money || can.cancel_events);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  // Finance is club-wide (its ledger is the club's); every other section follows the event,
  // so a grandfathered event's tabs carry no lock.
  const clubPlan = usePlan();
  const eventPlan = useEventPlan(eventId);
  // The Tickets tab, once the API has ticket types (null from one without).
  const tickets = useTicketTypes(eventId);
  const ticketsOn = Boolean(tickets.data);
  // A clock read once per navigation is enough for a "has it started" notice.
  const now = React.useMemo(() => new Date(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bare) return <>{children}</>;

  const tab = tabFor(rest);
  const e = event.data;
  const s = summary.data;
  const poster = pickImage(e?.poster, ["thumbnail", "medium", "original"]);
  const doorOpen = s?.door_open ?? false;
  const status = s?.status ?? e?.status;
  const where = e ? (e.is_online ? "Online" : e.location_name) : null;
  const standing = status ? STATUS_NOTICE[status] : undefined;
  const moneyTools = cancelState.data != null;
  const settle =
    status === "cancelled"
      ? can.money && moneyTools
        ? { label: "Refunds and notices", path: "/payments" }
        : undefined
      : status
        ? STATUS_ACTION[status]
        : undefined;
  const c = cancelState.data;
  const canCancel = Boolean(can.cancel_events && c && !c.cancelled && c.can_cancel);
  const onServer: Partial<Record<string, boolean>> = {
    results: results.data != null,
    // The payments of a paid event, and the aftermath of a cancelled one.
    payments: moneyTools && can.money && (Boolean(e?.has_fee) || status === "cancelled"),
  };
  const notices = s ? clockNotices(s, now) : [];

  return (
    <div className={cn(enter)}>
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="bg-sunken border-line-soft relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border">
          {poster ? (
            <Image src={poster} alt="" fill sizes="56px" className="object-cover" unoptimized />
          ) : (
            <CalendarDaysIcon aria-hidden="true" className="text-ink-3 size-5" />
          )}
        </div>
        <div className="min-w-[220px] flex-1">
          {e ? (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="page-title">{e.name}</h1>
              {status ? <EventStatusBadge status={status} /> : null}
            </div>
          ) : event.isError ? (
            <h1 className="page-title">Event</h1>
          ) : (
            <Skeleton className="h-7 w-64" />
          )}
          {e ? (
            <p className="text-ink-2 mt-1 text-[13px]">
              {e.club?.name ? <span className="text-ink font-medium">{e.club.name}</span> : null}
              {e.club?.name ? " · " : ""}
              {formatWindow(s?.starts_at ?? e.event_datetime, s?.ends_at ?? null)}
              {where ? ` · ${where}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" aria-label="Designs">
                <PaletteIcon /> Designs <ChevronDownIcon className="text-ink-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[230px]">
              {DESIGN_LINKS.map((d) => (
                <DropdownMenuItem key={d.kind} onSelect={() => router.push(`${base}/design?kind=${d.kind}`)}>
                  <span className="flex flex-col">
                    <span className="text-ink text-[13px]">{d.label}</span>
                    <span className="text-ink-3 text-[11.5px]">{d.hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {doorOpen ? (
            <Button asChild>
              <Link href={`/gate/${eventId}`}>
                <ScanLineIcon /> Open gate console
              </Link>
            </Button>
          ) : null}
          {e ? (
            <EventRowMenu
              event={{ id: e.id, name: e.name, slug: e.slug, registration_count: s?.registered ?? 0 }}
              onDeleted={() => router.replace("/events")}
              onCancel={canCancel ? () => setCancelOpen(true) : undefined}
            />
          ) : null}
          {e && canCancel ? <CancelEventDialog eventId={eventId} eventName={e.name} open={cancelOpen} onOpenChange={setCancelOpen} /> : null}
        </div>
      </header>

      {standing || notices.length ? (
        <div className="mt-4 grid gap-2">
          {status && standing ? (
            <Notice
              tag={status}
              tone={status === "draft" ? "caution" : status === "cancelled" ? "refuse" : "neutral"}
              action={
                settle ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`${base}${settle.path}`}>{settle.label}</Link>
                  </Button>
                ) : undefined
              }
            >
              {standing}
            </Notice>
          ) : null}
          {notices.map((n) => (
            <Notice
              key={n.tag}
              tag={n.tag}
              tone={n.tone}
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href={`${base}${n.action.path}`}>{n.action.label}</Link>
                </Button>
              }
            >
              {n.body}
            </Notice>
          ))}
        </div>
      ) : null}

      <TabRail
        className="mt-5"
        label="Event sections"
        value={tab}
        items={EVENT_TABS.filter(
          (t) =>
            (!("when" in t) || event.data?.[t.when] !== false) &&
            (t.key !== "finance" || can.money) &&
            (t.key !== "tickets" || ticketsOn) &&
            (!(t.key in onServer) || onServer[t.key] === true),
        ).map((t) => ({
          key: t.key,
          label: <TabLabel label={t.label} lock={TAB_FEATURE[t.key] ? (t.key === "finance" ? clubPlan : eventPlan).featureLock(TAB_FEATURE[t.key]!) : null} />,
          href: `${base}${t.path}`,
          count: t.key === "attendees" ? (s?.registered ?? null) : t.key === "check-ins" ? (s?.checked_in ?? null) : null,
        }))}
        renderLink={(item, props) => <Link href={item.href!} {...props} prefetch />}
      />
      <div className="mt-5">
        <TabPanel id={tab} kind="page">
          {children}
        </TabPanel>
      </div>
    </div>
  );
}
