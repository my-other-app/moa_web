"use client";

import * as React from "react";
import { Loader2Icon, Undo2Icon } from "lucide-react";
import { formatDate, formatDateTime, initials } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  EmptyState,
  Pager,
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
 *
 * Each tab pages through its own list. It used to ask for the first fifty
 * and offer no way past them, so the fifty-first deleted club was simply not
 * in Trash.
 */
const PAGE_SIZE = 20;

function usePaging() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  return {
    page,
    pageSize,
    query: { offset: (page - 1) * pageSize, limit: pageSize },
    setPage,
    /** Restoring the last row of a later page leaves it empty: step back rather than show "nothing deleted". */
    settle: (empty: boolean, loading: boolean) => {
      if (empty && !loading && page > 1) setPage(page - 1);
    },
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

function Paging({
  paging,
  total,
  busy,
  noun,
}: {
  paging: ReturnType<typeof usePaging>;
  total: number | null | undefined;
  busy: boolean;
  noun: [string, string];
}) {
  const count = total ?? 0;
  if (count === 0) return null;
  return (
    <Pager
      className="pt-2"
      page={paging.page}
      pageCount={Math.max(1, Math.ceil(count / paging.pageSize))}
      total={count}
      pageSize={paging.pageSize}
      noun={noun}
      busy={busy}
      onPage={paging.setPage}
      onPageSize={paging.setPageSize}
    />
  );
}

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
  error,
  isEmpty,
  emptyTitle,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
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
    // The server's words: "Try reloading" hid a 403 or a 500 behind the same shrug.
    return (
      <EmptyState
        tone="muted"
        title="Could not load"
        description={error instanceof Error && error.message ? error.message : "Try reloading."}
      />
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
  const paging = usePaging();
  const { data, isPending, isError, error, isFetching } = useDeletedClubs(paging.query);
  const restore = useRestoreClub();
  // The backend asks for one more row than the page to know there is a next one.
  const rows = (data?.items ?? []).slice(0, paging.pageSize);
  paging.settle(rows.length === 0, isPending);

  return (
    <List
      isPending={isPending}
      isError={isError}
      error={error}
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
          // Only the row being restored waits; the rest stay usable.
          pending={restore.isPending && restore.variables === club.id}
          index={i}
        />
      ))}
      <Paging paging={paging} total={data?.total} busy={isFetching} noun={["deleted club", "deleted clubs"]} />
    </List>
  );
}

function EventsTab() {
  const paging = usePaging();
  const { data, isPending, isError, error, isFetching } = useDeletedEvents(paging.query);
  const restore = useRestoreEvent();
  const rows = (data?.items ?? []).slice(0, paging.pageSize);
  paging.settle(rows.length === 0, isPending);

  return (
    <List
      isPending={isPending}
      isError={isError}
      error={error}
      isEmpty={rows.length === 0}
      emptyTitle="No deleted events"
    >
      {rows.map((event, i) => (
        <Row
          key={event.id}
          title={event.name}
          subtitle={`${event.club?.name ? `${event.club.name} · ` : ""}${formatDateTime(event.event_datetime)}`}
          onRestore={() => restore.mutate(event.id)}
          pending={restore.isPending && restore.variables === event.id}
          index={i}
        />
      ))}
      <Paging paging={paging} total={data?.total} busy={isFetching} noun={["deleted event", "deleted events"]} />
    </List>
  );
}

function OrgsTab() {
  const paging = usePaging();
  const { data, isPending, isError, error, isFetching } = useDeletedOrgs(paging.query);
  const restore = useRestoreOrg();
  const rows = (data?.items ?? []).slice(0, paging.pageSize);
  paging.settle(rows.length === 0, isPending);

  return (
    <List
      isPending={isPending}
      isError={isError}
      error={error}
      isEmpty={rows.length === 0}
      emptyTitle="No deleted organisations"
    >
      {rows.map((org, i) => (
        <Row
          key={org.id}
          title={org.name}
          subtitle={org.address ?? org.type ?? "No address"}
          onRestore={() => restore.mutate(org.id)}
          pending={restore.isPending && restore.variables === org.id}
          index={i}
        />
      ))}
      <Paging paging={paging} total={data?.total} busy={isFetching} noun={["deleted organisation", "deleted organisations"]} />
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
