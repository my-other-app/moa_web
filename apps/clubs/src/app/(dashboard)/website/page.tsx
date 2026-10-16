import type { Metadata } from "next";

import { SitePage } from "@/features/site";

export const metadata: Metadata = { title: "Website" };

export default function WebsitePage() {
  return <SitePage />;
}
