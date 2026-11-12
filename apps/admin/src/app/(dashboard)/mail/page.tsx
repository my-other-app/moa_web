import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { PlatformMailPage } from "@/features/platform-mail";

export const metadata: Metadata = { title: "Mail" };

export default function MailRoute() {
  return (
    <>
      <PageHeader title="Mail" description="admin@, developer@, developers@ and info@myotherapp.in: read and answer them here." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PlatformMailPage />
      </Suspense>
    </>
  );
}
