import type { Metadata } from "next";

import { PartnerAppsPage } from "@/features/integrations";

export const metadata: Metadata = { title: "Partner apps" };

export default function PartnerAppsRoute() {
  return <PartnerAppsPage />;
}
