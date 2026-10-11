import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EmailsPage } from "@/features/emails";

export const metadata: Metadata = { title: "Emails" };

export default async function EventEmailsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EmailsPage eventId={Number(eventId)} />
    </Suspense>
  );
}
