import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { OverviewCards } from "@/features/analytics";
import { GrowthChartPanel } from "@/features/analytics/components/growth-chart-panel";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Platform activity at a glance."
      />
      <div className="space-y-6">
        <OverviewCards />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New users</CardTitle>
            <CardDescription>Sign-ups over the last seven days.</CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthChartPanel />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
