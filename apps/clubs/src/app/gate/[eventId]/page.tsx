import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { GateConsole } from "@/features/gate";

export const metadata: Metadata = { title: "Gate" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };

/** The gate console: its own layout, no dashboard chrome, opened by a volunteer's phone. */
export default async function GatePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="m-4 h-96" />}>
      <GateConsole eventId={Number(eventId)} />
    </Suspense>
  );
}
