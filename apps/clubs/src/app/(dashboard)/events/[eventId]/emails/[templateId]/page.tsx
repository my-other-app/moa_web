import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EmailEditor } from "@/features/emails";

export const metadata: Metadata = { title: "Edit email" };

export default async function EventEmailEditorPage({ params }: { params: Promise<{ eventId: string; templateId: string }> }) {
  const { eventId, templateId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <EmailEditor scope={{ kind: "event", eventId: Number(eventId) }} templateId={templateId} />
    </Suspense>
  );
}
