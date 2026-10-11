import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { ContactsPage } from "@/features/contacts";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsRoute() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ContactsPage />
    </Suspense>
  );
}
