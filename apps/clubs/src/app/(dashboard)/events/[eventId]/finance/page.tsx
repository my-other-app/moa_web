import type { Metadata } from "next";

import { FinancePage } from "@/features/finance";

export const metadata: Metadata = { title: "Finance" };

export default async function EventFinancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <FinancePage scope={{ kind: "event", eventId: Number(eventId) }} />;
}
