import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { InterestsManager } from "@/features/interests";

export const metadata: Metadata = { title: "Interests" };

export default function InterestsPage() {
  return (
    <>
      <PageHeader
        title="Interests"
        description="The focus areas clubs, events and users pick from. Renaming one updates it everywhere."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <InterestsManager />
      </Suspense>
    </>
  );
}
