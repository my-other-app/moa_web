import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@/components/page-header";
import { UsersTable } from "@/features/users";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone registered on the platform."
      />
      {/* useSearchParams inside the table needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <UsersTable />
      </Suspense>
    </>
  );
}
