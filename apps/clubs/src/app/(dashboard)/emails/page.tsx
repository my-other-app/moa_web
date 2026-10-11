import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EmailLibraryPage } from "@/features/emails";

export const metadata: Metadata = { title: "Email library" };

export default function LibraryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EmailLibraryPage />
    </Suspense>
  );
}
