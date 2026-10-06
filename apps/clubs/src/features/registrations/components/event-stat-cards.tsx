"use client";

import {
  BuildingIcon,
  CircleDotIcon,
  EyeIcon,
  UsersIcon,
} from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { MetricCard, Skeleton, StatusBadge, cn, type StatusTone } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { eventStatus, type EventDetail, type EventStatus } from "@/features/events";
import { useEventAnalytics } from "../queries";

/**
 * The four figures at the top of an event.
 *
 * These were solid pastel blocks -- mint, lavender, sky, salmon -- taken from
 * the design file (node 168:1265). Beside the panels below them they read as
 * a different product: four saturated fields of colour above a page of white
 * cards and restrained accents. They now use the same MetricCard as both
 * dashboards, so colour carries meaning (the event's state) rather than
 * decorating every tile equally.
 */
const STATUS_COPY: Record<
  EventStatus,
  { label: string; caption: string; tone: StatusTone }
> = {
  live: {
    label: "Live",
    caption: "registrations are open",
    tone: "success",
  },
  closed: {
    label: "Closed",
    caption: "registrations closed, not yet held",
    tone: "warning",
  },
  ended: {
    label: "Ended",
    caption: "this event has finished",
    tone: "default",
  },
};

export function EventStatCards({ event }: { event: EventDetail | undefined }) {
  const { data, isPending, isError } = useEventAnalytics(event?.id ?? -1);

  if (isPending || !event) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[8.75rem] w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const status = STATUS_COPY[eventStatus(event)];
  // Page views live on the event, not on the analytics response -- the
  // endpoint only exposes them indirectly, through conversion_rate.
  const visitors = event.page_views ?? 0;

  const cards = [
    {
      label: "Status",
      value: <StatusBadge label={status.label} tone={status.tone} />,
      caption: status.caption,
      icon: <CircleDotIcon />,
      tone: "brand" as const,
    },
    {
      label: "Registrations",
      value: isError ? "--" : formatNumber(data?.total_registrations ?? 0),
      caption: "people signed up",
      icon: <UsersIcon />,
      tone: "info" as const,
    },
    {
      label: "Event visitors",
      value: formatNumber(visitors),
      caption: "viewed the event page",
      icon: <EyeIcon />,
      tone: "default" as const,
    },
    {
      label: "Institutions",
      value: isError ? "--" : formatNumber(data?.total_institutions ?? 0),
      caption: "distinct colleges",
      icon: <BuildingIcon />,
      tone: "warning" as const,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card, i) => (
        <div
          key={card.label}
          style={stagger(i)}
          className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
        >
          <MetricCard
            label={card.label}
            value={card.value}
            caption={card.caption}
            icon={card.icon}
            tone={card.tone}
            className={cn("h-full", hoverLift)}
          />
        </div>
      ))}
    </div>
  );
}
