import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { OpsGate } from "@/features/ops";
import { TemplatesPage } from "@/features/whatsapp-templates";

export const metadata: Metadata = { title: "WhatsApp templates" };

export default function WhatsAppTemplatesRoute() {
  return (
    <>
      <PageHeader title="WhatsApp templates" description="The message templates on MyOtherApp's own WhatsApp number, and whether Meta approved each." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <OpsGate feature="whatsapp_templates">
          <TemplatesPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
