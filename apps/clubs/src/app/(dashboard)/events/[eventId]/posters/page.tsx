import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PostersPage } from "@/features/posters";

export const metadata: Metadata = { title: "Posters" };

export default async function EventPostersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PostersPage eventId={Number(eventId)} />
    </Suspense>
  );
}
