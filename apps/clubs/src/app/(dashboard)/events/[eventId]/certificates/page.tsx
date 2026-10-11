import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { CertificatesPage } from "@/features/certificates";

export const metadata: Metadata = { title: "Certificates" };

export default async function EventCertificatesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CertificatesPage eventId={Number(eventId)} />
    </Suspense>
  );
}
