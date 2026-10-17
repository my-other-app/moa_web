import type { Metadata } from "next";

import { BillingPage } from "@/features/billing";

export const metadata: Metadata = { title: "Plan & billing" };

export default function ClubBillingPage() {
  return <BillingPage />;
}
