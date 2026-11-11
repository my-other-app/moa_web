import type { Metadata } from "next";

import { WebhookHealthPage } from "@/features/integrations";

export const metadata: Metadata = { title: "Webhook health" };

export default function WebhookHealthRoute() {
  return <WebhookHealthPage />;
}
