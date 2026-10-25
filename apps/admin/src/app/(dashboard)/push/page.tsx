import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { OpsGate } from "@/features/ops";
import { PushPage } from "@/features/push";

export const metadata: Metadata = { title: "Push" };

export default function PushRoute() {
  return (
    <>
      <PageHeader title="Push to everyone" description="A push notification to every device with the app, and whether pushes are working." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OpsGate feature="push">
          <PushPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
