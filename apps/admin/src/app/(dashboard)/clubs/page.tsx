import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { WhatsAppFallbacksCard } from "@/features/club-whatsapp";
import { ClubsV2 } from "@/features/clubs";

export const metadata: Metadata = { title: "Clubs" };

export default function ClubsPage() {
  return (
    // The v2 screen brings its own header, as on Overview and Users.
    // useSearchParams inside it needs a Suspense boundary.
    <>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ClubsV2 />
      </Suspense>
      {/* Clubs' own WhatsApp numbers: who fell back to the platform's most this month (none: nothing shown). */}
      <div className="mt-6">
        <WhatsAppFallbacksCard />
      </div>
    </>
  );
}
