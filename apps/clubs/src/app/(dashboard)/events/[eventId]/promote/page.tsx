import type { Metadata } from "next";
import { Suspense } from "react";

import { PromotePage } from "@/features/social";

export const metadata: Metadata = { title: "Promote" };

export default async function EventPromotePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  // Suspense: the tab reads ?compose=… when the publish step's "Edit posts" opens the editor.
  return (
    <Suspense fallback={null}>
      <PromotePage eventId={Number(eventId)} />
    </Suspense>
  );
}
