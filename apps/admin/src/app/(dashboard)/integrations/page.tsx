import type { Metadata } from "next";

import { ClubsAccessPage } from "@/features/integrations";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsClubsRoute() {
  return <ClubsAccessPage />;
}
