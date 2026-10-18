import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { ClubDomainsList } from "@/features/club-domains";

export const metadata: Metadata = { title: "Club domains" };

export default function ClubDomainsPage() {
  return (
    <>
      <PageHeader
        title="Club domains"
        description="Club websites on domains of their own. Pending ones wait for the club's DNS records; re-check one to look now. Removing one sends its visitors back to the club's myotherapp.in address."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ClubDomainsList />
      </Suspense>
    </>
  );
}
