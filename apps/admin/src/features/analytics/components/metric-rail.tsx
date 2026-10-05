"use client";

import Link from "next/link";
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  IndianRupeeIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import { MetricCard, Skeleton, cn, type MetricDelta } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useAdminAnalytics, useAdminTrends, useDashboardSignals } from "../queries";
import { changeOf, comparisonCaption } from "../delta";

/**
 * The four figures the dashboard leads with.
 *
 * Each carries its own direction over the selected window and a link through
 * to the list it summarises. The previous version showed four bare counters,
 * which told an admin the platform had 669 users but not whether that was a
 * good week -- and gave them nowhere to go next.
 */
function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 items-center justify-center rounded-md transition-colors"
    >
      <ArrowUpRightIcon className="size-3.5" />
    </Link>
  );
}

export function MetricRail({ days }: { days: number }) {
  const analytics = useAdminAnalytics();
  const trends = useAdminTrends(days);
  const signals = useDashboardSignals();

  if (analytics.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[8.5rem] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (analytics.isError || !analytics.data) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        Could not load platform statistics.
      </div>
    );
  }

  const data = analytics.data;
  const totals = trends.data?.totals;
  const previous = trends.data?.previous_totals;
  const caption = trends.data ? comparisonCaption(days) : undefined;

  // Only offered once the comparison window has loaded; an arrow drawn from
  // undefined would read as "flat" rather than "not known yet".
  const deltaFor = (key: "users" | "events" | "revenue"): MetricDelta | null =>
    totals && previous ? changeOf(totals[key], previous[key]) : null;

  const pending = signals.data?.clubs.pending ?? 0;

  const cards = [
    {
      label: "Total users",
      value: formatNumber(data.total_users),
      icon: <UsersIcon />,
      tone: "brand" as const,
      delta: deltaFor("users"),
      caption,
      href: "/users",
      linkLabel: "View all users",
    },
    {
      label: "Verified clubs",
      value: formatNumber(data.verified_clubs),
      icon: <UsersRoundIcon />,
      tone: "info" as const,
      delta: null,
      // The pending count is the actionable half of this number, so it takes
      // the caption slot instead of a comparison nobody would act on.
      caption: signals.data
        ? pending > 0
          ? `${formatNumber(pending)} awaiting approval`
          : "none awaiting"
        : undefined,
      href: "/clubs",
      linkLabel: "View all clubs",
    },
    {
      label: "Events hosted",
      value: formatNumber(data.events_hosted),
      icon: <CalendarDaysIcon />,
      tone: "warning" as const,
      delta: deltaFor("events"),
      caption,
      href: "/events",
      linkLabel: "View all events",
    },
    {
      label: "Platform revenue",
      value: formatCurrency(data.platform_revenue),
      icon: <IndianRupeeIcon />,
      tone: "success" as const,
      delta: deltaFor("revenue"),
      caption,
      href: "/payments",
      linkLabel: "View all payments",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.label}
          style={stagger(i)}
          className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
        >
          <MetricCard
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            delta={card.delta}
            caption={card.caption}
            action={<CardLink href={card.href} label={card.linkLabel} />}
            className={cn("h-full", hoverLift)}
          />
        </div>
      ))}
    </div>
  );
}
