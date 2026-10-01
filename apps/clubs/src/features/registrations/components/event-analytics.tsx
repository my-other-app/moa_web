"use client";

import { IndianRupeeIcon, PercentIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import { Skeleton, StatCard, cn } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useEventAnalytics } from "../queries";

export function EventAnalytics({ eventId }: { eventId: number }) {
  const { data, isPending, isError } = useEventAnalytics(eventId);

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) return null;

  const cards = [
    {
      label: "Registrations",
      value: formatNumber(data.total_registrations),
      icon: <UsersIcon />,
    },
    {
      label: "Attendance rate",
      value: `${Math.round(data.attendance_rate)}%`,
      icon: <UserCheckIcon />,
      tone: data.attendance_rate >= 50 ? ("success" as const) : undefined,
    },
    {
      label: "Revenue",
      value: formatCurrency(data.total_revenue),
      icon: <IndianRupeeIcon />,
    },
    {
      label: "Conversion",
      value: `${Math.round(data.conversion_rate)}%`,
      caption: "Registrations per page view",
      icon: <PercentIcon />,
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
