"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, ChevronDownIcon, PaletteIcon, ScanLineIcon } from "lucide-react";
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
import { EventRowMenu, EventStatusBadge, useEventDetail } from "@/features/events";
import { useEventSummary } from "../queries";
import { DESIGN_LINKS, EVENT_TABS, STATUS_ACTION, STATUS_NOTICE, clockNotices, tabFor } from "../schemas";

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
export function EventConsole({ eventId, children }: { eventId: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/events/${eventId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const bare = rest.startsWith("/design");
  const event = useEventDetail(eventId);
  const { can } = useAccess();
  const summary = useEventSummary(eventId);
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
  const settle = status ? STATUS_ACTION[status] : undefined;
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
          {e ? <EventRowMenu event={{ id: e.id, name: e.name, slug: e.slug, registration_count: s?.registered ?? 0 }} onDeleted={() => router.replace("/events")} /> : null}
        </div>
      </header>

      {standing || notices.length ? (
        <div className="mt-4 grid gap-2">
          {status && standing ? (
            <Notice
              tag={status}
              tone={status === "draft" ? "caution" : "neutral"}
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
        items={EVENT_TABS.filter((t) => (!("when" in t) || event.data?.[t.when] !== false) && (t.key !== "finance" || can.money)).map((t) => ({
          key: t.key,
          label: t.label,
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
