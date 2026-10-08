import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { SubscriptionsV2 } from "@/features/subscriptions";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return (
    // The nav has linked here since the v2 shell was built; until now the
    // route did not exist and the link 404'd.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SubscriptionsV2 />
    </Suspense>
  );
}
