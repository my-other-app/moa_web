import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EmailEditor } from "@/features/emails";

export const metadata: Metadata = { title: "Edit library email" };

export default async function LibraryEmailEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <EmailEditor scope={{ kind: "library" }} templateId={templateId} />
    </Suspense>
  );
}
