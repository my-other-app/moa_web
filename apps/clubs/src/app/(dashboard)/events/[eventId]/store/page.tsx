import type { Metadata } from "next";

import { StorePage } from "@/features/store";

export const metadata: Metadata = { title: "Merchandise" };

export default async function EventStorePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <StorePage eventId={Number(eventId)} />;
}
