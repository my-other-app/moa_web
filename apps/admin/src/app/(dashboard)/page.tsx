import type { Metadata } from "next";

import { DashboardView } from "@/features/analytics";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <DashboardView />;
}
