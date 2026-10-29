import type { Metadata, Viewport } from "next";

import { PresentPage } from "@/features/live";

export const metadata: Metadata = { title: "Present" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/**
 * What the club casts to the projector: the join QR, the code, and the quiz
 * while it runs. Its own layout, no dashboard chrome — as the host screen
 * has.
 */
export default async function LivePresentPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <PresentPage eventId={Number(eventId)} />;
}
