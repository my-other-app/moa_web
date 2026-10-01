"use client";

import { Skeleton } from "@moa/ui";

import { useAdminAnalytics } from "../queries";
import { GrowthChart } from "./growth-chart";

/**
 * Thin client boundary around the chart so the overview page can stay a server
 * component. Recharts measures the DOM, so it cannot render on the server.
 */
export function GrowthChartPanel() {
  const { data, isPending, isError } = useAdminAnalytics();

  if (isPending) return <Skeleton className="h-[260px] w-full" />;

  if (isError || !data) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Could not load growth data.
      </p>
    );
  }

  if (data.user_growth_data.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No sign-ups recorded in this period.
      </p>
    );
  }

  return <GrowthChart data={data.user_growth_data} />;
}
