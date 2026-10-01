import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@moa/app-kit";
import { Button, Skeleton } from "@moa/ui";

import { ClubEventsTable } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      <PageHeader
        title="Events"
        description="Your club's events, with live registration and check-in counts."
        action={
          <Button asChild>
            <Link href="/events/new">
              <PlusIcon /> New event
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ClubEventsTable />
      </Suspense>
    </>
  );
}
