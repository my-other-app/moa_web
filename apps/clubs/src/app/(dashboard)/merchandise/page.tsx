import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { CataloguePage } from "@/features/catalogue";

export const metadata: Metadata = { title: "Merchandise" };

export default function ClubMerchandisePage() {
  // The screen brings its own header; Suspense because it reads `?item=` to open one.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CataloguePage />
    </Suspense>
  );
}
