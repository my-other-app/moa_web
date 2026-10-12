import type { Metadata } from "next";

import { FinancePage } from "@/features/finance";

export const metadata: Metadata = { title: "Finance" };

export default function ClubFinancePage() {
  return <FinancePage scope={{ kind: "club" }} />;
}
