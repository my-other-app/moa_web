import type { Metadata } from "next";

import { AccessPage } from "@/features/access";

export const metadata: Metadata = { title: "Access" };

export default function ClubAccessPage() {
  return <AccessPage />;
}
