"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@moa/ui";

import { blockedBy, useAccess } from "@/features/access";

import { useClubAlerts, useMarkClubAlertsRead } from "../queries";
import { KIND_INFO, actionLabel, ago, alertLink } from "../schemas";

/**
 * The bell in the top bar: what MyOtherApp told the club (a month's emails
 * or WhatsApp at 80% and at 100% of the plan, bought credits running low or
 * about to expire -- each with "Buy credits"; the club's own WhatsApp number failing,
 * dropping in quality or restricted by Meta, each labelled and leading to
 * its page), unread first in the count, newest first
 * in the list. A notice leads only to a page the person signed in may open
 * (a member without the WhatsApp permission sees WhatsApp's notices, not a
 * link to a page that refuses them). Opening a notice marks it read; "Mark all read" clears the
 * badge for everyone at the club. Nothing is shown when the bell cannot be
 * read: it is never a reason for the page to look broken.
 */
export function ClubBell() {
  const [open, setOpen] = React.useState(false);
  const alerts = useClubAlerts();
  const mark = useMarkClubAlertsRead();
  const { can } = useAccess();
  if (alerts.isError || !alerts.data) return null;
  const { items, unread } = alerts.data;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications: ${unread} unread` : "Notifications"}
          className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink relative grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
        >
          <BellIcon className="size-4" aria-hidden="true" />
          {unread ? (
            <span aria-hidden="true" className="bg-refuse absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold text-white tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="border-line-soft flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <span className="text-ink text-[14px] font-semibold">Notifications</span>
          {unread > 0 ? (
            <button type="button" className="text-brand hover:text-ink flex items-center gap-1 text-[12px] font-medium" disabled={mark.isPending} onClick={() => mark.mutate(undefined)}>
              <CheckCheckIcon className="size-3.5" aria-hidden="true" /> Mark all read
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="text-ink-3 px-3 py-6 text-center text-[12.5px]">
            Nothing yet. Warnings about your plan&apos;s monthly messages, your message credits and your own WhatsApp number show up here.
          </p>
        ) : (
          <ul aria-label="Latest notifications" className="divide-line-soft max-h-[420px] divide-y overflow-y-auto">
            {items.map((a) => {
              const to = alertLink(a);
              const href = to && !blockedBy(to, can) ? to : null;
              const info = KIND_INFO[a.kind];
              const action = href ? actionLabel(a) : null;
              const body = (
                <span className="flex flex-col gap-0.5">
                  {info ? (
                    <span className={cn("eyebrow text-[10.5px]", info.tone === "refuse" ? "text-refuse" : info.tone === "info" ? "text-info" : "text-caution")}>{info.label}</span>
                  ) : null}
                  <span className={cn("text-[13px]", a.read ? "text-ink-2" : "text-ink font-semibold")}>{a.title}</span>
                  {a.body ? <span className="text-ink-3 text-[12px] leading-[1.45]">{a.body}</span> : null}
                  {action ? <span className="text-brand text-[12px] font-medium underline-offset-2 hover:underline">{action} →</span> : null}
                  <span className="text-ink-3 text-[11px]">{ago(a.created_at)}</span>
                </span>
              );
              const read = () => {
                if (!a.read) mark.mutate([a.id]);
                setOpen(false);
              };
              return (
                <li key={a.id} className={cn("px-3 py-2.5", !a.read && "bg-brand/5")}>
                  {href ? (
                    <Link href={href} onClick={read} className="block">
                      {body}
                    </Link>
                  ) : (
                    <button type="button" onClick={read} className="block w-full text-left">
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
