import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { DesignerPage } from "@/features/designer";

export const metadata: Metadata = { title: "Templates" };

/**
 * The club's defaults: a ticket, an ID card, a certificate and a programme
 * that every event starts from, designed in the same editor an event uses.
 * The page draws its own header, the same one an event's designs have.
 */
export default function TemplatesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <DesignerPage scope={{ kind: "club" }} />
    </Suspense>
  );
}
