import type { Metadata } from "next";

import { DiscountCodesPage } from "@/features/ticketing";

export const metadata: Metadata = { title: "Discount codes" };

export default function ClubDiscountCodesPage() {
  return <DiscountCodesPage />;
}
