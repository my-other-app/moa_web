"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import {
  PageHeader,
  SectionTitle,
  formatDateTime,
  formatNumber,
  initials,
  pickImage,
} from "@moa/app-kit";
import { pageCount } from "@moa/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  DialogTrigger,
  EmptyState,
  Pagination,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
  cn,
} from "@moa/ui";
import { enter, hoverLift, pressable, stagger } from "@moa/ui/motion";

import { useClubs } from "@/features/clubs";
import { useEvents } from "@/features/events";
import { useDeleteOrg, useOrg, useOrgAnalytics, useSetOrgBlocked } from "../queries";
import { OrgFormDialog } from "./org-form";

/**
 * One organisation.
 *
 * The analytics endpoint has existed since the organisation module was
 * written and nothing ever called it; this is the page it was built for.
 */
const PAGE_SIZE = 10;

export function OrgDetail({ orgId }: { orgId: number }) {
  const router = useRouter();
  const { data: org, isPending, isError } = useOrg(orgId);
  const { data: analytics } = useOrgAnalytics(orgId);
  const setBlocked = useSetOrgBlocked();
  const remove = useDeleteOrg();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  // Each list pages independently; sharing one ?page= would move both.
  const [clubPage, setClubPage] = React.useState(1);
  const [eventPage, setEventPage] = React.useState(1);

  const clubs = useClubs({
    orgId,
    offset: (clubPage - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const events = useEvents({
    orgId,
    offset: (eventPage - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this organisation"
        description="It may have been deleted."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/organizations">Back to organisations</Link>
          </Button>
        }
      />
    );
  }

  const logo = pickImage(org?.logo, ["medium", "thumbnail", "original"]);

  const cards = [
    {
      label: "Clubs",
      value: analytics ? formatNumber(analytics.total_clubs) : "--",
      icon: <UsersRoundIcon />,
    },
    {
      label: "Events",
      value: analytics ? formatNumber(analytics.total_events) : "--",
      icon: <CalendarDaysIcon />,
    },
    {
      label: "Followers",
      value: analytics ? formatNumber(analytics.total_followers) : "--",
      caption: "Across every club in this organisation",
      icon: <UsersIcon />,
    },
  ];

  const clubRows = clubs.data?.items.slice(0, PAGE_SIZE) ?? [];
  const clubPages = pageCount(clubs.data?.total ?? null, PAGE_SIZE) ?? 1;
  const eventRows = events.data?.items.slice(0, PAGE_SIZE) ?? [];
  const eventPages = pageCount(events.data?.total ?? null, PAGE_SIZE) ?? 1;

  return (
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/organizations">
          <ArrowLeftIcon /> All organisations
        </Link>
      </Button>

      <PageHeader
        title={org?.name ?? "Organisation"}
        action={
          org ? (
            <div className="flex items-center gap-2">
              <OrgFormDialog
                org={org}
                open={editOpen}
                onOpenChange={setEditOpen}
                trigger={
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className={pressable}>
                      <PencilIcon /> Edit
                    </Button>
                  </DialogTrigger>
                }
              />
              <Button
                size="sm"
                variant="outline"
                className={pressable}
                disabled={setBlocked.isPending}
                onClick={() =>
                  setBlocked.mutate({ id: org.id, blocked: !org.is_blocked })
                }
              >
                {org.is_blocked ? <CheckCircleIcon /> : <BanIcon />}
                {org.is_blocked ? "Unblock" : "Block"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("text-destructive hover:text-destructive", pressable)}
                disabled={remove.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon /> Delete
              </Button>
            </div>
          ) : null
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {logo ? (
              <Image
                src={logo}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-xl object-cover"
                unoptimized
              />
            ) : (
              <Avatar className="size-16 rounded-xl">
                <AvatarFallback className="rounded-xl text-lg">
                  {initials(org?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              {isPending ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {org?.type ? (
                      <Badge variant="outline" className="capitalize">
                        {org.type}
                      </Badge>
                    ) : null}
                    {org?.is_blocked ? (
                      <StatusBadge tone="destructive" label="Blocked" />
                    ) : (
                      <StatusBadge tone="success" label="Active" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {org?.address || "No address"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {org?.email || "No email"}
                    {org?.phone ? ` · ${org.phone}` : ""}
                    {org?.website ? ` · ${org.website}` : ""}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {org?.is_blocked ? (
          <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
            This organisation is blocked, which hides its clubs from the app.
          </div>
        ) : null}

        <section className="space-y-3">
          <SectionTitle>Reach</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card, i) => (
              <div
                key={card.label}
                style={stagger(i)}
                className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
              >
                <StatCard
                  label={card.label}
                  value={card.value}
                  caption={card.caption}
                  icon={card.icon}
                  className={cn("h-full", hoverLift)}
                />
              </div>
            ))}
          </div>
        </section>

        <Tabs defaultValue="clubs">
          <TabsList>
            <TabsTrigger value="clubs">
              Clubs{clubs.data ? ` (${formatNumber(clubs.data.total ?? 0)})` : ""}
            </TabsTrigger>
            <TabsTrigger value="events">
              Events{events.data ? ` (${formatNumber(events.data.total ?? 0)})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clubs" className="space-y-3">
          {clubs.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : clubs.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load clubs"
              description="Try reloading the page."
            />
          ) : clubRows.length === 0 ? (
            <EmptyState
              tone="muted"
              title="No clubs yet"
              description="Clubs that pick this organisation will appear here."
            />
          ) : (
            <div className="space-y-2">
              {clubRows.map((club, i) => (
                <div
                  key={club.id}
                  style={stagger(i)}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                    hoverLift
                  )}
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="text-[11px]">
                      {initials(club.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clubs/${club.id}`}
                      className="block truncate font-medium underline-offset-4 hover:underline"
                    >
                      {club.name}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {club.location_name || "No location"}
                    </p>
                  </div>
                  {/* Unverified clubs are visible here on purpose: the public
                      listing hides them, and they are what an admin needs. */}
                  <StatusBadge
                    tone={club.is_verified ? "success" : "warning"}
                    label={club.is_verified ? "Verified" : "Pending"}
                  />
                </div>
              ))}
            </div>
          )}

          {!clubs.isPending && clubRows.length > 0 && clubPages > 1 ? (
            <Pagination
              page={clubPage}
              pageCount={clubPages}
              onPageChange={setClubPage}
            />
          ) : null}
          </TabsContent>

          <TabsContent value="events" className="space-y-3">
          {events.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : events.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load events"
              description="Try reloading the page."
            />
          ) : eventRows.length === 0 ? (
            <EmptyState
              tone="muted"
              title="No events yet"
              description="Events run by this organisation's clubs will appear here."
            />
          ) : (
            <div className="space-y-2">
              {eventRows.map((event, i) => (
                <div
                  key={event.id}
                  style={stagger(i)}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                    hoverLift
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/events/${event.id}`}
                      className="block truncate font-medium underline-offset-4 hover:underline"
                    >
                      {event.name}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {event.club?.name ? `${event.club.name} · ` : ""}
                      {formatDateTime(event.event_datetime)}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatNumber(event.page_views ?? 0)} views
                  </span>
                </div>
              ))}
            </div>
          )}

          {!events.isPending && eventRows.length > 0 && eventPages > 1 ? (
            <Pagination
              page={eventPage}
              pageCount={eventPages}
              onPageChange={setEventPage}
            />
          ) : null}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{org?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {(analytics?.total_clubs ?? 0) > 0 ? (
                <>
                  <strong>
                    {formatNumber(analytics?.total_clubs ?? 0)} club
                    {(analytics?.total_clubs ?? 0) === 1 ? "" : "s"}
                  </strong>{" "}
                  belong to this organisation. They are not deleted, but they
                  lose their organisation and will show none. Consider blocking
                  it instead, which is reversible.
                </>
              ) : (
                "This removes the organisation. The record is retained in the database but cannot be restored from here."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                // The hook toasts a refusal; only a delete that went through
                // leaves the page. Awaiting mutateAsync here left every
                // refusal as an unhandled promise rejection.
                remove.mutate(orgId, { onSuccess: () => router.replace("/organizations") })
              }
            >
              Delete organisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
