import type { Metadata } from "next";

import { GuestProfilePage } from "@/features/people";

export const metadata: Metadata = { title: "Guest" };

export default async function EventPersonPage({ params }: { params: Promise<{ eventId: string; ref: string }> }) {
  const { eventId, ref } = await params;
  return <GuestProfilePage eventId={Number(eventId)} personRef={decodeURIComponent(ref)} />;
}
