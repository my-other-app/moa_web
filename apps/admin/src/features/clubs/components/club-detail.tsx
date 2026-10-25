"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CheckIcon,
  Loader2Icon,
  StarIcon,
  Trash2Icon,
  UserCheckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  PageHeader,
  PersonAvatar,
  SectionTitle,
  TopicChips,
  formatCurrency,
  formatDate,
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

import {
  useApproveClub,
  useClub,
  useClubEvents,
  useClubFollowers,
  useClubLifetime,
  useDeleteClub,
} from "../queries";
import { useResolvedTopics } from "@/features/interests";
import { ClubCreditsPanel, ClubMessagesPanel } from "@/features/messages";
import { ClubPlanPanel } from "@/features/subscriptions";
import { ClubWhatsAppCard } from "@/features/club-whatsapp";

import { requestedPlanText, type ClubEvent, type ClubFollower } from "../schemas";
import { ClubEditForm } from "./club-edit-form";

/**
 * One club, in full.
 *
 * Reads the admin detail endpoint rather than /clubs/info/{id}, because that
 * one enforces `is_verified` -- a pending club 404s there, which is exactly
 * the club an admin opens this page to judge.
 */
const PAGE_SIZE = 10;

function usePage() {
  const [page, setPage] = React.useState(1);
  return { page, setPage, offset: (page - 1) * PAGE_SIZE };
}

function FollowersTab({ clubId }: { clubId: number }) {
  const { page, setPage, offset } = usePage();
  const { data, isPending, isError } = useClubFollowers(clubId, {
    offset,
    limit: PAGE_SIZE,
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <EmptyState tone="muted" title="Could not load followers" description="Try reloading." />;
  }

  const rows = data?.items.slice(0, PAGE_SIZE) ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        tone="muted"
        title="No followers yet"
        description="People who follow this club in the app will appear here."
      />
    );
  }

  const pages = pageCount(data?.total ?? null, PAGE_SIZE) ?? 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((row: ClubFollower, i) => (
          <div
            key={row.user?.id ?? i}
            style={stagger(i)}
            className={cn(
              "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
              hoverLift
            )}
          >
            <PersonAvatar
              name={row.user?.full_name || row.user?.username}
              photo={row.user?.profile?.profile_pic}
              avatar={row.user?.profile?.avatar?.image}
              className="size-9"
              fallbackClassName="text-[11px]"
            />
            <div className="min-w-0 flex-1">
              {row.user?.id ? (
                <Link
                  href={`/users/${row.user.id}`}
                  className="block truncate font-medium underline-offset-4 hover:underline"
                >
                  {row.user.full_name || row.user.username}
                </Link>
              ) : (
                <p className="truncate font-medium">Unknown</p>
              )}
              {/* Not email: /clubs/followers/{id} is DependsAuth, so any
                  signed-in user can read it, and the response schema
                  deliberately carries no address. Username is what the API
                  actually returns. */}
              <p className="text-muted-foreground truncate text-xs">
                {row.user?.username ? `@${row.user.username}` : "--"}
              </p>
            </div>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatDate(row.created_at)}
            </span>
          </div>
        ))}
      </div>
      {pages > 1 ? (
        <Pagination page={page} pageCount={pages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

function EventsTab({ clubId }: { clubId: number }) {
  const { page, setPage, offset } = usePage();
  const { data, isPending, isError } = useClubEvents(clubId, {
    offset,
    limit: PAGE_SIZE,
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <EmptyState tone="muted" title="Could not load events" description="Try reloading." />;
  }

  const rows = data?.items.slice(0, PAGE_SIZE) ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        tone="muted"
        title="No events yet"
        description="Events this club publishes will appear here."
      />
    );
  }

  const pages = pageCount(data?.total ?? null, PAGE_SIZE) ?? 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((event: ClubEvent, i) => {
          const poster = pickImage(event.poster, ["thumbnail", "medium", "original"]);
          return (
            <div
              key={event.id}
              style={stagger(i)}
              className={cn(
                "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                hoverLift
              )}
            >
              <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-md">
                {poster ? (
                  <Image src={poster} alt="" fill sizes="40px" className="object-cover" unoptimized />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{event.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {formatDateTime(event.event_datetime)}
                  {event.location_name ? ` · ${event.location_name}` : ""}
                </p>
              </div>
              <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                <p>{formatNumber(event.registration_count ?? 0)} registered</p>
                <p>{formatNumber(event.attended_count ?? 0)} attended</p>
              </div>
            </div>
          );
        })}
      </div>
      {pages > 1 ? (
        <Pagination page={page} pageCount={pages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

/**
 * What the club has done over every event it has run, and the colours its
 * designs fall back to. The lifetime figures are the ones a reviewer quotes.
 */
function LifetimeSection({ clubId, brand }: { clubId: number; brand: { primary: string | null; secondary: string | null } }) {
  const { data: life, isError } = useClubLifetime(clubId);
  if (isError) return null;
  const cards = [
    { label: "Events run", value: life ? formatNumber(life.events_run) : "--", caption: "finished, not drafts" },
    { label: "Guests admitted", value: life ? formatNumber(life.guests_admitted) : "--", caption: life ? `of ${formatNumber(life.registered)} registered` : undefined },
    { label: "Average turnout", value: life ? (life.average_turnout_pct === null ? "--" : `${life.average_turnout_pct}%`) : "--", caption: "across finished events" },
    { label: "Reports delivered", value: life ? formatNumber(life.reports_delivered) : "--", caption: "closeout reports sent" },
  ];
  return (
    <section className="space-y-3">
      <SectionTitle>Lifetime</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} caption={card.caption} className="h-full" />
        ))}
      </div>
      <div className="bg-card ring-border/70 flex flex-wrap items-center gap-3 rounded-2xl p-4 shadow-sm ring-1">
        <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.09em] uppercase">Brand</span>
        {[
          ["Primary", brand.primary],
          ["Secondary", brand.secondary],
        ].map(([label, colour]) => (
          <span key={label} className="flex items-center gap-2 text-[12.5px]">
            <span aria-hidden="true" className="border-border/60 size-6 rounded-md border" style={{ background: colour ?? "transparent" }} />
            <span>{label}</span>
            <span className="text-muted-foreground font-mono text-[11px]">{colour ?? "not set"}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function ClubDetail({ clubId }: { clubId: number }) {
  const router = useRouter();
  const { data: club, isPending, isError } = useClub(clubId);
  // Its topics: the server's own, else derived from its interests against the topic list.
  const clubTopics = useResolvedTopics(club);
  const approve = useApproveClub();
  const remove = useDeleteClub();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this club"
        description="It may have been deleted."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/clubs">Back to clubs</Link>
          </Button>
        }
      />
    );
  }

  const logo = pickImage(club?.logo, ["medium", "thumbnail", "original"]);
  const stats = club?.admin_stats;

  const cards = [
    {
      label: "Followers",
      value: club ? formatNumber(club.followers_count) : "--",
      icon: <UsersIcon />,
    },
    {
      label: "Total events",
      value: club ? formatNumber(club.total_events) : "--",
      icon: <CalendarDaysIcon />,
    },
    {
      label: "Live events",
      value: club ? formatNumber(club.live_events) : "--",
      icon: <CalendarCheckIcon />,
      tone: club && club.live_events > 0 ? ("success" as const) : undefined,
    },
    {
      label: "Registrations",
      value: stats ? formatNumber(stats.total_registrations) : "--",
      icon: <UserCheckIcon />,
    },
    {
      label: "Revenue",
      value: stats ? formatCurrency(stats.total_revenue) : "--",
      icon: <WalletIcon />,
    },
    {
      label: "Rating",
      value:
        club && (club.total_ratings ?? 0) > 0
          ? `${(club.rating ?? 0).toFixed(1)} / 5`
          : "--",
      caption:
        club && (club.total_ratings ?? 0) > 0
          ? `${formatNumber(club.total_ratings ?? 0)} ratings`
          : "No ratings yet",
      icon: <StarIcon />,
    },
  ];

  return (
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/clubs">
          <ArrowLeftIcon /> All clubs
        </Link>
      </Button>

      <PageHeader
        title={club?.name ?? "Club"}
        action={
          club ? (
            <div className="flex items-center gap-2">
              {!club.is_verified ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={pressable}
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(club.id)}
                >
                  {approve.isPending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <CheckIcon />
                  )}
                  Approve
                </Button>
              ) : null}
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
                  {initials(club?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              {isPending ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={club?.is_verified ? "success" : "warning"}
                      label={club?.is_verified ? "Verified" : "Pending approval"}
                    />
                    {club?.org?.name ? (
                      <Badge variant="outline">{club.org.name}</Badge>
                    ) : null}
                    {club?.requested_plan ? (
                      <Badge variant="outline" title="Picked on the sign-up form; nothing is granted by it">
                        Requested plan: {requestedPlanText(club.requested_plan, club.requested_cycle)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {club?.location_name || "No location"}
                    {club?.contact_email ? ` · ${club.contact_email}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {club?.owner?.email ? `Owner ${club.owner.email} · ` : ""}
                    Created {formatDate(club?.created_at)}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {club ? <ClubPlanPanel club={{ id: club.id, name: club.name, is_verified: club.is_verified }} /> : null}

        {/* The month's emails and WhatsApp, the closed months, an Enterprise club's own limits. */}
        {club ? <ClubMessagesPanel clubId={club.id} /> : null}

        {/* Prepaid message credits: balance, lots, purchases (refunds), free grants. */}
        {club ? <ClubCreditsPanel clubId={club.id} /> : null}

        {/* Its own WhatsApp number, if any: status and quality, never a message. */}
        {club ? <ClubWhatsAppCard clubId={club.id} /> : null}

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

        {club ? <LifetimeSection clubId={clubId} brand={{ primary: club.brand_primary ?? null, secondary: club.brand_secondary ?? null }} /> : null}

        {club?.interests?.length ? (
          <section className="space-y-3">
            <SectionTitle>Focus areas</SectionTitle>
            <TopicChips topics={clubTopics} />
            <div className="flex flex-wrap gap-2">
              {club.interests.map((interest) => (
                <Badge key={interest.id} variant="outline">
                  {interest.name}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="followers">Followers</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
          <TabsContent value="events">
            <EventsTab clubId={clubId} />
          </TabsContent>
          <TabsContent value="followers">
            <FollowersTab clubId={clubId} />
          </TabsContent>
          <TabsContent value="edit">
            {club ? <ClubEditForm club={club} /> : <Skeleton className="h-96 w-full" />}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{club?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* The real consequence: there is no "deleted" state, only a
                  soft delete, and everything downstream keys off it. */}
              This removes the club from the platform. It disappears from club
              listings and search, its organisers lose access, and its{" "}
              {formatNumber(club?.total_events ?? 0)} event
              {(club?.total_events ?? 0) === 1 ? "" : "s"} go with it. It
              goes to Trash, where it can be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                // The hook toasts a refusal; only a delete that went through leaves the page.
                remove.mutate(clubId, { onSuccess: () => router.replace("/clubs") })
              }
            >
              Delete club
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
