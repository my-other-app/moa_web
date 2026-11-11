import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { CasesPage } from "@/features/support";
import { TeamworkGate } from "@/features/teamwork";

export const metadata: Metadata = { title: "Support" };

export default function SupportRoute() {
  return (
    <>
      <PageHeader title="Support" description="Every question from the app, the website, the club dashboard and email, with an owner and a time to answer by." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamworkGate>
          <CasesPage />
        </TeamworkGate>
      </Suspense>
    </>
  );
}
