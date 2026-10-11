"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  BuildingIcon,
  DownloadIcon,
  EyeIcon,
  PercentIcon,
  Trash2Icon,
  TrophyIcon,
  UserCheckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  PageHeader,
  SectionTitle,
  formatCurrency,
  formatDateTime,
  formatNumber,
  pickImage,
  useListParams,
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
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  SearchInput,
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

import { ArrivalCurveCard, EventAnalyticsPanels } from "@moa/app-kit";

import { eventExportUrl } from "../api";
import {
  useDeleteEvent,
  useEvent,
  useEventAnalytics,
  useEventRegistrations,
  useEventSummary,
} from "../queries";
import type { EventRegistration } from "../schemas";
import { PlacingControl } from "./placing-control";
import { EventEditForm } from "./event-edit-form";

/**
 * One event, for an admin.
 *
 * Everything here reads endpoints that used to 403 for admins: ClubAuth
 * admitted them by role, then the ownership check compared against the owning
 * club's user id. The access rule now has an explicit admin exemption, so
 * registrations, analytics and the export are readable across every club.
 */
function RegistrationsTab({ eventId }: { eventId: number }) {
  const params = useListParams();
  const [attendedOnly, setAttendedOnly] = React.useState(false);

  const { data, isPending, isError } = useEventRegistrations(eventId, {
    offset: params.offset,
    limit: params.pageSize,
    search: params.search || undefined,
    isAttended: attendedOnly ? true : undefined,
  });

  const rows = data?.items.slice(0, params.pageSize) ?? [];
  const pages = pageCount(data?.total ?? null, params.pageSize) ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={params.searchInput}
          onChange={params.setSearchInput}
          onDebouncedChange={params.commitSearch}
          placeholder="Search participants…"
          containerClassName="w-full sm:max-w-xs"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={attendedOnly ? "default" : "outline"}
            className={pressable}
            onClick={() => {
              setAttendedOnly((v) => !v);
              params.setPage(1);
            }}
          >
            <UserCheckIcon /> Attended only
          </Button>
          <Button size="sm" variant="outline" className={pressable} asChild>
            <a href={eventExportUrl(eventId)} download>
              <DownloadIcon /> Export
            </a>
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          tone="muted"
          title="Could not load registrations"
          description="Try reloading the page."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          tone="muted"
          title={params.search ? "No matches" : "No registrations yet"}
          description={
            params.search
              ? `Nothing matched “${params.search}”.`
              : "People who register will appear here."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row: EventRegistration, i) => (
            <div
              key={row.id}
              style={stagger(i)}
              className={cn(
                "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                hoverLift
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.full_name || "Unknown"}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {row.email || "--"}
                  {row.institution ? ` · ${row.institution}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.is_won ? (
                  <Badge variant="secondary">
                    <TrophyIcon className="size-3" />
                    {row.position ? `#${row.position}` : "Placed"}
                  </Badge>
                ) : null}
                <PlacingControl
                  eventId={eventId}
                  registrationId={row.id}
                  position={row.position}
                  name={row.full_name || "this participant"}
                />
                {row.is_attended ? (
                  <StatusBadge tone="success" label="Attended" />
                ) : null}
                {row.is_paid ? (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatCurrency(row.paid_amount)}
                  </span>
                ) : null}
                <code className="bg-muted hidden rounded px-1.5 py-0.5 text-xs sm:inline">
                  {row.ticket_id || "--"}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isPending && rows.length > 0 && pages > 1 ? (
        <Pagination
          page={params.page}
          pageCount={pages}
          onPageChange={params.setPage}
          pageSize={params.pageSize}
          onPageSizeChange={params.setPageSize}
        />
      ) : null}
    </div>
  );
}

/**
 * The door as a shape: the arrival curve and its timing, the load on each
 * door, turnout by role, whether tickets reached people, how guests were
 * admitted. The same panels the club sees on its console, read-only here.
 */
function DoorTab({ eventId }: { eventId: number }) {
  const { data: s, isPending, isError } = useEventSummary(eventId);
  if (isPending) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (isError || !s) {
    return <EmptyState tone="muted" title="Could not load the door's figures" description="Try reloading the page." />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-3.5">
      <ArrivalCurveCard a={s.analytics} startsAt={s.starts_at} timezone={s.timezone} fromReport={s.from_report} className="col-span-full" />
      <EventAnalyticsPanels a={s.analytics} timezone={s.timezone} fromReport={s.from_report} registered={s.registered} doorOpen={s.door_open} />
    </div>
  );
}

function InstitutionsTab({ eventId }: { eventId: number }) {
  const { data, isPending, isError } = useEventAnalytics(eventId);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState tone="muted" title="Could not load analytics" description="Try reloading." />
    );
  }
  if (data.top_institutions.length === 0) {
    return (
      <EmptyState
        tone="muted"
        title="No institutions recorded"
        description="This is taken from the college question on the registration form."
      />
    );
  }

  const max = Math.max(...data.top_institutions.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        The five largest of {formatNumber(data.total_institutions)} institution
        {data.total_institutions === 1 ? "" : "s"} represented.
      </p>
      {data.top_institutions.map((institution, i) => (
        <div key={institution.name} style={stagger(i)} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{institution.name}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {formatNumber(institution.value)}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${(institution.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventDetail({ eventId }: { eventId: number }) {
  const router = useRouter();
  const { data: event, isPending, isError } = useEvent(eventId);
  const { data: analytics } = useEventAnalytics(eventId);
  const remove = useDeleteEvent();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this event"
        description="It may have been deleted."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/events">Back to events</Link>
          </Button>
        }
      />
    );
  }

  const poster = pickImage(event?.poster, ["medium", "large", "original", "thumbnail"]);
  const registrations = analytics?.total_registrations ?? 0;

  const cards = [
    {
      label: "Registrations",
      value: analytics ? formatNumber(registrations) : "--",
      icon: <UsersIcon />,
    },
    {
      label: "Attendance rate",
      value: analytics ? `${Math.round(analytics.attendance_rate)}%` : "--",
      icon: <UserCheckIcon />,
      tone:
        analytics && analytics.attendance_rate >= 50 ? ("success" as const) : undefined,
    },
    {
      label: "Revenue",
      value: analytics ? formatCurrency(analytics.total_revenue) : "--",
      icon: <WalletIcon />,
    },
    {
      label: "Page views",
      value: event ? formatNumber(event.page_views ?? 0) : "--",
      icon: <EyeIcon />,
    },
    {
      label: "Conversion",
      value: analytics ? `${Math.round(analytics.conversion_rate)}%` : "--",
      caption: "Registrations per page view",
      icon: <PercentIcon />,
    },
    {
      label: "Institutions",
      value: analytics ? formatNumber(analytics.total_institutions) : "--",
      icon: <BuildingIcon />,
    },
  ];

  return (
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/events">
          <ArrowLeftIcon /> All events
        </Link>
      </Button>

      <PageHeader
        title={event?.name ?? "Event"}
        action={
          event ? (
            <Button
              size="sm"
              variant="ghost"
              className={cn("text-destructive hover:text-destructive", pressable)}
              disabled={remove.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2Icon /> Delete
            </Button>
          ) : null
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row">
            <div className="bg-muted relative size-24 shrink-0 overflow-hidden rounded-xl">
              {isPending ? (
                <Skeleton className="size-full" />
              ) : poster ? (
                <Image
                  src={poster}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                  unoptimized
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              {isPending ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {event?.club?.name ? (
                      <Badge variant="outline">{event.club.name}</Badge>
                    ) : null}
                    {event?.category?.name ? (
                      <Badge variant="secondary">{event.category.name}</Badge>
                    ) : null}
                    {event?.is_online ? <Badge variant="outline">Online</Badge> : null}
                    {event?.has_fee ? (
                      <Badge variant="outline">
                        Fee {formatCurrency(event.reg_fee ?? 0)}
                      </Badge>
                    ) : null}
                    {event?.has_prize ? (
                      <Badge variant="outline">
                        <TrophyIcon className="size-3" />
                        {formatCurrency(event.prize_amount ?? 0)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(event?.event_datetime)}
                    {event?.location_name ? ` · ${event.location_name}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Registration closes {formatDateTime(event?.reg_enddate)}
                    {event?.max_participants
                      ? ` · cap ${formatNumber(event.max_participants)}`
                      : ""}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <SectionTitle>Performance</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                  tone={card.tone}
                  className={cn("h-full", hoverLift)}
                />
              </div>
            ))}
          </div>
        </section>

        <Tabs defaultValue="registrations">
          <TabsList>
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="door">Door</TabsTrigger>
            <TabsTrigger value="institutions">Institutions</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
          <TabsContent value="registrations">
            <RegistrationsTab eventId={eventId} />
          </TabsContent>
          <TabsContent value="door">
            <DoorTab eventId={eventId} />
          </TabsContent>
          <TabsContent value="institutions">
            <InstitutionsTab eventId={eventId} />
          </TabsContent>
          <TabsContent value="edit">
            {event ? (
              <EventEditForm event={event} />
            ) : (
              <Skeleton className="h-96 w-full" />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{event?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {registrations > 0 ? (
                <>
                  The API refuses to delete an event that people have
                  registered for, and{" "}
                  <strong>
                    {formatNumber(registrations)}{" "}
                    {registrations === 1 ? "person has" : "people have"}
                  </strong>{" "}
                  registered — so this will be rejected. That guard is what
                  stops someone&rsquo;s ticket disappearing.
                </>
              ) : (
                "This removes the event from the app. It cannot be undone from here."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={registrations > 0}
              onClick={async () => {
                await remove.mutateAsync(eventId);
                router.replace("/events");
              }}
            >
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
