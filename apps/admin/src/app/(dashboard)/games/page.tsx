import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { GamesPage } from "@/features/games";

export const metadata: Metadata = { title: "Games" };

export default function GamesRoute() {
  return (
    <>
      <PageHeader title="Games" description="Hero Cards and the Scavenger Hunt: how many events run them, how many players are in right now, and what they did." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <GamesPage />
      </Suspense>
    </>
  );
}
