import type { Metadata } from "next";

import { AdminOverviewV2 } from "@/features/analytics";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  // The v2 screen brings its own header, so PageHeader is deliberately absent.
  return <AdminOverviewV2 />;
}
