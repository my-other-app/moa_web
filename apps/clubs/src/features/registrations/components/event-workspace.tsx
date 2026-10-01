"use client";

import Link from "next/link";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { PageHeader } from "@moa/app-kit";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@moa/ui";

import { SendAnnouncementDialog } from "@/features/announcements";
import { VolunteersPanel } from "@/features/volunteers";
import { EventAnalytics } from "./event-analytics";
import { RegistrationsTable } from "./registrations-table";
import { useEventAnalytics } from "../queries";

/**
 * Everything an organiser does on the day lives here: who registered, who
 * turned up, who is helping, and telling them all something.
 */
export function EventWorkspace({ eventId }: { eventId: number }) {
  const { data } = useEventAnalytics(eventId);
  const registered = data?.total_registrations ?? 0;

  return (
    <>
      <div className="mb-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/events">
            <ArrowLeftIcon /> All events
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Event"
        description="Registrations, attendance and volunteers."
        action={
          <>
            <SendAnnouncementDialog eventId={eventId} recipientCount={registered} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/events/${eventId}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <EventAnalytics eventId={eventId} />

        <Tabs defaultValue="registrations">
          <TabsList>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          </TabsList>
          <TabsContent value="registrations">
            <RegistrationsTable eventId={eventId} />
          </TabsContent>
          <TabsContent value="volunteers">
            <VolunteersPanel eventId={eventId} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
