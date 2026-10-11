"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDownIcon, PaletteIcon, ScanLineIcon } from "lucide-react";
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
import { enter, pressable } from "@moa/ui/motion";

import { EventRowActions, EventStatusBadge, useEventDetail } from "@/features/events";
import { useEventSummary } from "../queries";
import { DESIGN_LINKS, EVENT_TABS, STATUS_NOTICE, clockNotices, tabFor } from "../schemas";

/**
 * The operational heart of an event: its name and status, the one-line
 * notices its clock earns, the actions that are always wanted, and a rail
 * of sections in the order of the event's life. Every page under the event
 * renders inside it; the designer is the exception, because it wants the
 * whole width and its own tabs.
 */
export function EventConsole({ eventId, children }: { eventId: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/events/${eventId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const bare = rest.startsWith("/design");
  const event = useEventDetail(eventId);
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

  return (
    <div className={cn(enter)}>
      <div className="flex flex-wrap items-start gap-3.5">
        <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-xl">
          {poster ? <Image src={poster} alt="" fill sizes="56px" className="object-cover" unoptimized /> : null}
        </div>
        <div className="min-w-[200px] flex-1">
          {e ? (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[26px] leading-[1.12] tracking-[-0.015em] sm:text-[30px]">{e.name}</h1>
              {status ? <EventStatusBadge status={status} /> : null}
            </div>
          ) : (
            <Skeleton className="h-8 w-64" />
          )}
          <div className="text-muted-foreground mt-1 text-[13px]">
            {e?.club?.name ? <span className="text-foreground">{e.club.name}</span> : null}
            {e ? (
              <span>
                {e.club?.name ? " · " : ""}
                {formatWindow(s?.starts_at ?? e.event_datetime, s?.ends_at ?? null)}
                {e.location_name ? ` · ${e.is_online ? "Online" : e.location_name}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={pressable} aria-label="Designs">
                <PaletteIcon /> Designs <ChevronDownIcon className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {DESIGN_LINKS.map((d) => (
                <DropdownMenuItem key={d.kind} onSelect={() => router.push(`${base}/design?kind=${d.kind}`)}>
                  <span className="flex flex-col">
                    <span>{d.label}</span>
                    <span className="text-muted-foreground text-[11.5px]">{d.hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* The gate refuses check-ins while the door is shut, so the console is not offered as the primary action then. */}
          {doorOpen ? (
            <Button asChild className={pressable}>
              <Link href={`/gate/${eventId}`}>
                <ScanLineIcon /> Open gate console
              </Link>
            </Button>
          ) : null}
          {e ? <EventRowActions event={{ id: e.id, name: e.name, registration_count: s?.registered ?? 0 }} onDeleted={() => router.replace("/events")} /> : null}
        </div>
      </div>

      {status && STATUS_NOTICE[status] ? (
        <Notice tag={status} className="mt-4" tone={status === "draft" ? "caution" : "neutral"}>
          {STATUS_NOTICE[status]}
        </Notice>
      ) : null}
      {s
        ? clockNotices(s, now).map((n) => (
            <Notice key={n.tag} tag={n.tag} tone={n.tone} className="mt-3">
              {n.body}
            </Notice>
          ))
        : null}

      <TabRail
        className="mt-4"
        label="Event sections"
        value={tab}
        items={EVENT_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: `${base}${t.path}`,
          count: t.key === "attendees" ? (s?.registered ?? null) : t.key === "check-ins" ? (s?.checked_in ?? null) : null,
        }))}
        renderLink={(item, props) => (
          <Link href={item.href!} {...props} prefetch />
        )}
      />
      <div className="mt-[18px]">
        <TabPanel id={tab} kind="page">
          {children}
        </TabPanel>
      </div>
    </div>
  );
}
