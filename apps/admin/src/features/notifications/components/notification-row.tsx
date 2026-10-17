"use client";

import Link from "next/link";
import {
  AlarmClockIcon,
  BanIcon,
  BellIcon,
  Building2Icon,
  CircleCheckIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  CircleXIcon,
  CrownIcon,
  HourglassIcon,
  IndianRupeeIcon,
  SparklesIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { alertLabel, kindLabel, kindTone, notificationHref, type AdminNotification, type KindTone } from "../schemas";

const ICON: Record<string, LucideIcon> = {
  club_applied: Building2Icon,
  subscription_trial_started: SparklesIcon,
  subscription_activated: CircleCheckIcon,
  payment_received: IndianRupeeIcon,
  payment_failed: CircleXIcon,
  subscription_past_due: TriangleAlertIcon,
  grace_started: HourglassIcon,
  grace_ending: AlarmClockIcon,
  subscription_downgraded: TrendingDownIcon,
  subscription_paused: CirclePauseIcon,
  subscription_resumed: CirclePlayIcon,
  subscription_cancelled: BanIcon,
  plan_assigned: CrownIcon,
};

const TONE: Record<KindTone, string> = {
  money: "bg-admit-soft text-admit",
  failure: "bg-refuse-soft text-refuse",
  grace: "bg-caution-soft text-caution",
  application: "bg-brand-soft text-brand",
  change: "bg-info-soft text-info",
  ended: "bg-sunken text-ink-2",
};

/** The kind's mark: an icon in its colour, named for a screen reader. */
export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICON[kind] ?? BellIcon;
  return (
    <span role="img" aria-label={kindLabel(kind)} data-tone={kindTone(kind)} className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", TONE[kindTone(kind)], className)}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * One notification: what happened, to which club, when, and a way to the
 * record. Opening it marks it read; so does "Mark read".
 */
export function NotificationRow({
  n,
  now,
  canMark = true,
  onRead,
  onOpen,
  compact = false,
}: {
  n: AdminNotification;
  now: Date;
  canMark?: boolean;
  onRead: (id: string) => void;
  /** After following the link: the bell closes its panel. */
  onOpen?: () => void;
  compact?: boolean;
}) {
  const unread = !n.read_at;
  const href = notificationHref(n);
  const open = () => {
    if (unread && canMark) onRead(n.id);
    onOpen?.();
  };
  return (
    <li data-unread={unread || undefined} className={cn("flex items-start gap-3 px-3 py-2.5", unread && "bg-brand-soft/30")}>
      <KindIcon kind={n.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {href ? (
            <Link href={href} onClick={open} className={cn("text-ink min-w-0 flex-1 text-[13px] leading-[1.35] hover:underline", unread && "font-semibold")}>
              {n.title}
            </Link>
          ) : (
            <span className={cn("text-ink min-w-0 flex-1 text-[13px] leading-[1.35]", unread && "font-semibold")}>{n.title}</span>
          )}
          {unread ? <span aria-label="Unread" className="bg-brand mt-1.5 size-2 shrink-0 rounded-full" /> : null}
        </div>
        {n.body ? <p className={cn("text-ink-2 mt-0.5 text-[12.5px] leading-[1.45]", compact && "line-clamp-2")}>{n.body}</p> : null}
        <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
          <span>{alertLabel(n)}</span>
          {n.club ? (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/clubs/${n.club.id}`} onClick={onOpen} className="hover:text-ink underline-offset-2 hover:underline">
                {n.club.name}
              </Link>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <time dateTime={n.created_at} title={n.created_at}>
            {relativeTime(n.created_at, now)}
          </time>
          {unread && canMark ? (
            <button type="button" className="text-brand hover:text-ink ml-auto font-medium" onClick={() => onRead(n.id)} aria-label={`Mark read: ${n.title}`}>
              Mark read
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
