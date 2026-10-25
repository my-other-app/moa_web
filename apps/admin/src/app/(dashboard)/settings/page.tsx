import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { OpsGate } from "@/features/ops";
import { SettingsPage } from "@/features/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsRoute() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform switches an owner changes without SSH, whether each secret is set, and what changed."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OpsGate feature="settings">
          <SettingsPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
