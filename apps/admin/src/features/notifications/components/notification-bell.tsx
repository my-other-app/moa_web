"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from "../queries";
import { NotificationRow } from "./notification-row";

/** How many the bell's panel lists before "See all". */
export const BELL_LIMIT = 10;

/**
 * The bell in the top bar: how many notifications are unread (asked for
 * every minute), and the latest ten a click away, each with its way to the
 * club or the subscription. Any admin reads them; marking them read needs
 * `moderate` (support and up), like the other moderation writes, since it
 * clears them for every admin.
 */
export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const canMark = useCan("moderate");
  const count = useUnreadCount();
  const latest = useNotifications({ offset: 0, limit: BELL_LIMIT }, open);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unread = count.data?.unread ?? 0;
  const items = latest.data?.items ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setNow(new Date());
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications: ${unread} unread` : "Notifications"}
          className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink relative grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
        >
          <BellIcon className="size-4" aria-hidden="true" />
          {unread ? (
            <span aria-hidden="true" className="bg-refuse absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold text-refuse-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(400px,calc(100vw-24px))] p-0">
        <div className="border-line-soft flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <span className="text-ink text-[14px] font-semibold">Notifications</span>
          {canMark && unread > 0 ? (
            <button type="button" className="text-brand hover:text-ink flex items-center gap-1 text-[12px] font-medium" disabled={markAll.isPending} onClick={() => markAll.mutate(null)}>
              <CheckCheckIcon className="size-3.5" aria-hidden="true" /> Mark all read
            </button>
          ) : null}
        </div>
        {latest.isPending ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : latest.isError ? (
          <p className="text-ink-3 px-3 py-6 text-center text-[12.5px]">Could not load the notifications.</p>
        ) : items.length === 0 ? (
          <p className="text-ink-3 px-3 py-6 text-center text-[12.5px]">Nothing yet. Applications, payments and failed charges show up here.</p>
        ) : (
          <ul aria-label="Latest notifications" className={cn("divide-line-soft max-h-[420px] divide-y overflow-y-auto")}>
            {items.map((n) => (
              <NotificationRow key={n.id} n={n} now={now} compact canMark={canMark} onRead={(id) => markRead.mutate(id)} onOpen={() => setOpen(false)} />
            ))}
          </ul>
        )}
        <div className="border-line-soft border-t px-3 py-2">
          <Link href="/notifications" onClick={() => setOpen(false)} className="text-brand hover:text-ink text-[12.5px] font-medium">
            See all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
