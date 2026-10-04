import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { NewOrgButton, OrgsTable } from "@/features/orgs";

export const metadata: Metadata = { title: "Organisations" };

export default function OrganizationsPage() {
  return (
    <>
      <PageHeader
        title="Organisations"
        description="Colleges and institutions. Blocking one hides all of its clubs from the app."
        action={<NewOrgButton />}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OrgsTable />
      </Suspense>
    </>
  );
}
