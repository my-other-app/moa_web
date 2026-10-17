import type { Metadata } from "next";

import { PaymentsPage } from "@/features/payments";

export const metadata: Metadata = { title: "Payments" };

export default function ClubPaymentsPage() {
  return <PaymentsPage />;
}
