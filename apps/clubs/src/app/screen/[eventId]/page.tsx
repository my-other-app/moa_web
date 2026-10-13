import type { Metadata, Viewport } from "next";

import { ScreenPage } from "@/features/live";

export const metadata: Metadata = { title: "Screen" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** The big screen at the front of the room: its own layout, no dashboard chrome. */
export default async function LiveScreenPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <ScreenPage eventId={Number(eventId)} />;
}
