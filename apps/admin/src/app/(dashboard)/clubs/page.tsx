import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { ClubsV2 } from "@/features/clubs";

export const metadata: Metadata = { title: "Clubs" };

export default function ClubsPage() {
  return (
    // The v2 screen brings its own header, as on Overview and Users.
    // useSearchParams inside it needs a Suspense boundary.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ClubsV2 />
    </Suspense>
  );
}
