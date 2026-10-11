import type { Metadata } from "next";

import { LinksPage } from "@/features/links";

export const metadata: Metadata = { title: "Tracking links" };

export default function ClubLinksPage() {
  return <LinksPage scope={{ kind: "club" }} />;
}
