import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { DesignerPage } from "@/features/designer";

export const metadata: Metadata = { title: "Templates" };

/**
 * The club's defaults: a ticket, an ID card, a certificate and a programme
 * that every event starts from, designed in the same editor an event uses.
 */
export default function TemplatesPage() {
  return (
    <>
      <header className="mb-5">
        <h1 className="page-title">Templates</h1>
        <p className="text-ink-2 mt-1 max-w-[62ch] text-[13.5px]">
          Your club&apos;s defaults. Every new event starts from these; an event that has designed its own keeps it, so editing here never reaches back into tickets already sent.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
        <DesignerPage scope={{ kind: "club" }} />
      </Suspense>
    </>
  );
}
