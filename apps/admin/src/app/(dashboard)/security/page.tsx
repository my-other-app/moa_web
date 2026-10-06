import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { SessionsPanel, TwoFactorPanel } from "@/features/security";
import { BackupsPanel } from "@/features/backups";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        title="Security"
        description="Your own account, and the data behind it. Admin accounts can refund, delete and impersonate, so a password alone is thin protection."
      />
      <div className="max-w-3xl space-y-6">
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <TwoFactorPanel />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SessionsPanel />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <BackupsPanel />
        </Suspense>
      </div>
    </>
  );
}
