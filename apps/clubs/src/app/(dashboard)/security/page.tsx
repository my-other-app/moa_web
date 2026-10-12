import type { Metadata } from "next";

import { SecurityPage } from "@/features/security";

export const metadata: Metadata = { title: "Security" };

export default function ClubSecurityPage() {
  return <SecurityPage />;
}
