import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { IntegrationsGate } from "@/features/integrations";

/** Integrations' three screens share the header, the probe and the tab rail. */
export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="The public API: which clubs may use it and how much they do, the partner apps that work for clubs, and how webhooks are faring. Nothing is on until it is given here."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <IntegrationsGate>{children}</IntegrationsGate>
      </Suspense>
    </>
  );
}
