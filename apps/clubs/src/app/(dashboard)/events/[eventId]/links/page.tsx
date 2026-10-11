import type { Metadata } from "next";

import { LinksPage } from "@/features/links";

export const metadata: Metadata = { title: "Tracking links" };

export default async function EventLinksPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <LinksPage scope={{ kind: "event", eventId: Number(eventId) }} />;
}
