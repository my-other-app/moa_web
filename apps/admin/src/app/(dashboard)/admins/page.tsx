import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { AdminsPage } from "@/features/admins";
import { OpsGate } from "@/features/ops";

export const metadata: Metadata = { title: "Admins" };

export default function AdminsRoute() {
  return (
    <>
      <PageHeader
        title="Admins"
        description="Who can sign in to this portal, with which role, and whether they use two-factor. Owners add and remove admins."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <OpsGate feature="admins">
          <AdminsPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
