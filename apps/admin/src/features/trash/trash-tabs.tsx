"use client";

import { Loader2Icon, Undo2Icon } from "lucide-react";
import { formatDate, formatDateTime, initials } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  EmptyState,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { useDeletedClubs, useRestoreClub } from "@/features/clubs";
import { useDeletedEvents, useRestoreEvent } from "@/features/events";
import { useDeletedOrgs, useRestoreOrg } from "@/features/orgs";

/**
 * Everything soft-deleted, in one place.
 *
 * Badges are absent on purpose: BadgeDefinitions hard-deletes, so there is
 * nothing to restore and listing an empty tab would imply otherwise.
 */
const PAGE = { offset: 0, limit: 50 };

function Row({
  title,
  subtitle,
  badge,
  onRestore,
  pending,
  index,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  onRestore: () => void;
  pending: boolean;
  index: number;
}) {
  return (
    <div
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      <Avatar className="size-9">
        <AvatarFallback className="text-[11px]">{initials(title)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
      </div>
      {badge}
      <Button
        size="xs"
        variant="outline"
        className={pressable}
        disabled={pending}
        onClick={onRestore}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
        Restore
      </Button>
    </div>
  );
}

function List({
  isPending,
  isError,
  isEmpty,
  emptyTitle,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  children: React.ReactNode;
}) {
  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState tone="muted" title="Could not load" description="Try reloading." />
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        tone="muted"
        title={emptyTitle}
        description="Anything you delete here can be brought back."
      />
    );
  }
  return <div className="space-y-2">{children}</div>;
}

function ClubsTab() {
  const { data, isPending, isError } = useDeletedClubs(PAGE);
  const restore = useRestoreClub();
  const rows = data?.items ?? [];

  return (
    <List
      isPending={isPending}
      isError={isError}
      isEmpty={rows.length === 0}
      emptyTitle="No deleted clubs"
    >
      {rows.map((club, i) => (
        <Row
          key={club.id}
          title={club.name}
          subtitle={`Created ${formatDate(club.created_at)}`}
          // Restoring does not re-verify, so what it was matters.
          badge={
            <StatusBadge
              tone={club.is_verified ? "success" : "warning"}
              label={club.is_verified ? "Was verified" : "Was pending"}
            />
          }
          onRestore={() => restore.mutate(club.id)}
          pending={restore.isPending}
          index={i}
        />
      ))}
    </List>
  );
}

function EventsTab() {
  const { data, isPending, isError } = useDeletedEvents(PAGE);
  const restore = useRestoreEvent();
  const rows = data?.items ?? [];

  return (
    <List
      isPending={isPending}
      isError={isError}
      isEmpty={rows.length === 0}
      emptyTitle="No deleted events"
    >
      {rows.map((event, i) => (
        <Row
          key={event.id}
          title={event.name}
          subtitle={`${event.club?.name ? `${event.club.name} · ` : ""}${formatDateTime(event.event_datetime)}`}
          onRestore={() => restore.mutate(event.id)}
          pending={restore.isPending}
          index={i}
        />
      ))}
    </List>
  );
}

function OrgsTab() {
  const { data, isPending, isError } = useDeletedOrgs(PAGE);
  const restore = useRestoreOrg();
  const rows = data?.items ?? [];

  return (
    <List
      isPending={isPending}
      isError={isError}
      isEmpty={rows.length === 0}
      emptyTitle="No deleted organisations"
    >
      {rows.map((org, i) => (
        <Row
          key={org.id}
          title={org.name}
          subtitle={org.address ?? org.type ?? "No address"}
          onRestore={() => restore.mutate(org.id)}
          pending={restore.isPending}
          index={i}
        />
      ))}
    </List>
  );
}

export function TrashTabs() {
  return (
    <Tabs defaultValue="clubs">
      <TabsList>
        <TabsTrigger value="clubs">Clubs</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="orgs">Organisations</TabsTrigger>
      </TabsList>
      <TabsContent value="clubs">
        <ClubsTab />
      </TabsContent>
      <TabsContent value="events">
        <EventsTab />
      </TabsContent>
      <TabsContent value="orgs">
        <OrgsTab />
      </TabsContent>
    </Tabs>
  );
}
