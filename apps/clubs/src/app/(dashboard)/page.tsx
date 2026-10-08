import type { Metadata } from "next";

import { ClubDashboardV2 } from "@/features/club";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  // The v2 screen brings its own header, so PageHeader is deliberately
  // absent -- as on every rebuilt screen in the admin app.
  return <ClubDashboardV2 />;
}
