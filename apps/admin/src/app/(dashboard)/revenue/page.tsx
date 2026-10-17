import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { RevenuePage } from "@/features/revenue";

export const metadata: Metadata = { title: "Revenue" };

export default function RevenueRoute() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RevenuePage />
    </Suspense>
  );
}
