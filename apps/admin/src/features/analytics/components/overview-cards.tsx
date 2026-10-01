"use client";

import {
  CalendarDaysIcon,
  IndianRupeeIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Skeleton, StatCard, cn } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { formatCurrency, formatNumber } from "@moa/app-kit";
import { useAdminAnalytics } from "../queries";

const CARD_COUNT = 4;

export function OverviewCards() {
  const { data, isPending, isError } = useAdminAnalytics();

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        Could not load platform statistics.
      </div>
    );
  }

  const cards = [
    {
      label: "Total users",
      value: formatNumber(data.total_users),
      caption: data.total_users_delta,
      icon: <UsersIcon />,
    },
    {
      label: "Verified clubs",
      value: formatNumber(data.verified_clubs),
      caption: data.verified_clubs_delta,
      icon: <UsersRoundIcon />,
    },
    {
      label: "Events hosted",
      value: formatNumber(data.events_hosted),
      caption: data.events_hosted_delta,
      icon: <CalendarDaysIcon />,
    },
    {
      label: "Platform revenue",
      value: formatCurrency(data.platform_revenue),
      caption: data.platform_revenue_delta,
      icon: <IndianRupeeIcon />,
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
          <StatCard
            label={card.label}
            value={card.value}
            caption={card.caption ?? undefined}
            icon={card.icon}
            className={cn("h-full", hoverLift)}
          />
        </div>
      ))}
    </div>
  );
}
