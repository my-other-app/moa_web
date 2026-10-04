"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftIcon,
  AwardIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  FileDownIcon,
  Loader2Icon,
  TrophyIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";
import {
  PageHeader,
  SectionTitle,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  initials,
  pickImage,
} from "@moa/app-kit";
import { pageCount } from "@moa/api";
import { fetchAllPages } from "@moa/app-kit";
import { toast } from "@moa/ui";
import {
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
  cn,
} from "@moa/ui";
import { enter, hoverLift, stagger } from "@moa/ui/motion";

import {
  fetchUser,
  fetchUserBadges,
  fetchUserClubs,
  fetchUserEvents,
} from "../api";
import { useUser, useUserBadges, useUserClubs, useUserEvents } from "../queries";
import { ImpersonateButton } from "./impersonate-button";
import { SuspendButton } from "./suspend-button";
import type { UserClub, UserEvent } from "../schemas";

/**
 * One user, in full.
 *
 * The admin dashboard could list users but not open one, so questions like
 * "how many clubs does this person follow" and "which events did they
 * actually attend" had no answer anywhere in the product. Each list here is
 * paginated against its own endpoint rather than embedded in the detail
 * payload, so an account with thousands of registrations stays cheap to open.
 */
const PAGE_SIZE = 10;

/**
 * Page state for one sub-list. Local rather than in the URL: the detail page
 * already owns the ?tab state conceptually, and three independent page params
 * in the query string would collide.
 */
function usePage() {
  const [page, setPage] = React.useState(1);
  return { page, setPage, offset: (page - 1) * PAGE_SIZE };
}

function ClubRow({ club, index }: { club: UserClub; index: number }) {
  const logo = pickImage(club.logo, ["thumbnail", "medium", "original"]);

  return (
    <div
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-md object-cover"
          unoptimized
        />
      ) : (
        <Avatar className="size-10 rounded-md">
          <AvatarFallback className="rounded-md text-xs">
            {initials(club.name)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{club.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {club.location_name || "No location"}
        </p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {formatNumber(club.followers_count)} followers
      </span>
    </div>
  );
}

function EventRow({ row, index }: { row: UserEvent; index: number }) {
  const poster = pickImage(row.event.poster, ["thumbnail", "medium", "original"]);

  return (
    <div
      style={stagger(index)}
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
        <p className="truncate font-medium">{row.event.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {row.event.club?.name ? `${row.event.club.name} · ` : ""}
          {formatDateTime(row.event.event_datetime)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.is_paid ? (
          <Badge variant="secondary" className="tabular-nums">
            {formatCurrency(row.paid_amount)}
          </Badge>
        ) : null}
        <code className="bg-muted hidden rounded px-1.5 py-0.5 text-xs sm:inline">
          {row.ticket_id}
        </code>
      </div>
    </div>
  );
}

/** Shared paging shell for the two sub-lists. */
function PagedList<T>({
  items,
  total,
  page,
  onPageChange,
  isPending,
  isError,
  emptyTitle,
  emptyDescription,
  renderRow,
}: {
  items: T[];
  total: number | null;
  page: number;
  onPageChange: (next: number) => void;
  isPending: boolean;
  isError: boolean;
  emptyTitle: string;
  emptyDescription: string;
  renderRow: (row: T, index: number) => React.ReactNode;
}) {
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
    return (
      <EmptyState tone="muted" title="Could not load this list" description="Try reloading." />
    );
  }

  if (items.length === 0) {
    return <EmptyState tone="muted" title={emptyTitle} description={emptyDescription} />;
  }

  const pages = pageCount(total, PAGE_SIZE) ?? 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2">{items.map(renderRow)}</div>
      {pages > 1 ? (
        <Pagination page={page} pageCount={pages} onPageChange={onPageChange} />
      ) : null}
    </div>
  );
}

function ClubsTab({ userId }: { userId: number }) {
  const { page, setPage, offset } = usePage();
  const { data, isPending, isError } = useUserClubs(userId, {
    offset,
    limit: PAGE_SIZE,
  });

  return (
    <PagedList
      items={data?.items.slice(0, PAGE_SIZE) ?? []}
      total={data?.total ?? null}
      page={page}
      onPageChange={setPage}
      isPending={isPending}
      isError={isError}
      emptyTitle="Not following any clubs"
      emptyDescription="Clubs this person follows in the app will appear here."
      renderRow={(club, i) => <ClubRow key={club.id} club={club} index={i} />}
    />
  );
}

type EventScope = "all" | "attended" | "won";

function EventsTab({ userId }: { userId: number }) {
  const [scope, setScope] = React.useState<EventScope>("all");
  const { page, setPage, offset } = usePage();

  const { data, isPending, isError } = useUserEvents(userId, {
    offset,
    limit: PAGE_SIZE,
    isAttended: scope === "attended" ? true : undefined,
    isWon: scope === "won" ? true : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["all", "All"],
            ["attended", "Attended"],
            ["won", "Won"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? "default" : "outline"}
            onClick={() => {
              setScope(value);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <PagedList
        items={data?.items.slice(0, PAGE_SIZE) ?? []}
        total={data?.total ?? null}
        page={page}
        onPageChange={setPage}
        isPending={isPending}
        isError={isError}
        emptyTitle={
          scope === "won"
            ? "Has not won anything"
            : scope === "attended"
              ? "Has not attended an event"
              : "No registrations"
        }
        emptyDescription="Events this person registers for will appear here."
        renderRow={(row, i) => <EventRow key={row.ticket_id} row={row} index={i} />}
      />
    </div>
  );
}

function BadgesTab({ userId }: { userId: number }) {
  const { data, isPending, isError } = useUserBadges(userId);

  if (isPending) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState tone="muted" title="Could not load badges" description="Try reloading." />
    );
  }

  if (!data?.badges.length) {
    return (
      <EmptyState
        tone="muted"
        title="No badges yet"
        description="Badges are awarded automatically when thresholds are met, or manually from the Badges page."
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {data.badges.map((badge, i) => (
        <div
          key={badge.id}
          style={stagger(i)}
          className={cn(
            "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
            hoverLift
          )}
        >
          <span aria-hidden="true" className="text-2xl">
            {badge.emoji || "🏅"}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{badge.name || badge.slug}</p>
            <p className="text-muted-foreground truncate text-xs">
              {badge.awarded_at ? `Awarded ${formatDate(badge.awarded_at)}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Everything the platform holds on one person, as a JSON file.
 *
 * Assembled client-side from the admin endpoints rather than added as a
 * backend export: the data is already reachable, and a subject-access request
 * is rare enough that a dedicated endpoint would be speculative. If this ever
 * needs to be signed, logged or delivered asynchronously it belongs on the
 * server instead.
 */
function DataExportButton({ userId, name }: { userId: number; name: string }) {
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const [profile, badges] = await Promise.all([
        fetchUser(userId),
        fetchUserBadges(userId).catch(() => null),
      ]);
      const clubs = await fetchAllPages((offset, limit) =>
        fetchUserClubs(userId, { offset, limit })
      );
      const events = await fetchAllPages((offset, limit) =>
        fetchUserEvents(userId, { offset, limit })
      );

      const payload = {
        exported_at: new Date().toISOString(),
        profile,
        badges: badges?.badges ?? [],
        clubs_followed: clubs.rows,
        event_registrations: events.rows,
        truncated: clubs.truncated || events.truncated,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `user-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`Exported everything held on ${name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={run}>
      {busy ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />}
      {busy ? "Collecting…" : "Export data"}
    </Button>
  );
}

export function UserDetail({ userId }: { userId: number }) {
  const { data: user, isPending, isError } = useUser(userId);

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this user"
        description="They may have been deleted."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/users">Back to users</Link>
          </Button>
        }
      />
    );
  }

  const avatar =
    pickImage(user?.profile?.profile_pic, ["medium", "thumbnail", "original"]) ??
    pickImage(user?.profile?.avatar?.image, ["medium", "thumbnail", "original"]);

  const stats = user?.stats;

  const cards = [
    {
      label: "Clubs followed",
      value: stats ? formatNumber(stats.clubs_following) : "--",
      icon: <UsersRoundIcon />,
    },
    {
      label: "Events registered",
      value: stats ? formatNumber(stats.events_registered) : "--",
      icon: <CalendarDaysIcon />,
    },
    {
      label: "Events attended",
      value: stats ? formatNumber(stats.events_attended) : "--",
      icon: <CalendarCheckIcon />,
      tone: stats && stats.events_attended > 0 ? ("success" as const) : undefined,
    },
    {
      label: "Events won",
      value: stats ? formatNumber(stats.events_won) : "--",
      icon: <TrophyIcon />,
    },
    {
      label: "Badges earned",
      value: stats ? formatNumber(stats.badges_earned) : "--",
      icon: <AwardIcon />,
    },
    {
      label: "Total paid",
      value: stats ? formatCurrency(stats.total_paid) : "--",
      icon: <WalletIcon />,
    },
  ];

  return (
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/users">
          <ArrowLeftIcon /> All users
        </Link>
      </Button>

      <PageHeader
        title={user?.full_name || user?.username || "User"}
        action={
          user ? (
            <div className="flex items-center gap-2">
              <SuspendButton
                userId={userId}
                name={user.full_name || user.username}
                isActive={user.is_active}
              />
              <ImpersonateButton
                userId={userId}
                name={user.full_name || user.username}
                userType={user.user_type}
              />
              <DataExportButton
                userId={userId}
                name={user.full_name || user.username}
              />
            </div>
          ) : null
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-xl object-cover"
                unoptimized
              />
            ) : (
              <Avatar className="size-16 rounded-xl">
                <AvatarFallback className="rounded-xl text-lg">
                  {initials(user?.full_name ?? user?.username ?? "?")}
                </AvatarFallback>
              </Avatar>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              {isPending ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">@{user?.username}</p>
                    {user && !user.is_active ? (
                      <StatusBadge tone="destructive" label="Suspended" />
                    ) : null}
                    <Badge variant="outline">
                      {user?.user_type?.replace("_", " ")}
                    </Badge>
                    {user?.provider ? (
                      <Badge variant="secondary">{user.provider}</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {user?.email || "No email"}
                    {user?.phone ? ` · ${user.phone}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {user?.profile?.org?.name
                      ? `${user.profile.org.name} · `
                      : ""}
                    Joined {formatDate(user?.created_at)}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {user && !user.is_active ? (
          <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
            This account is suspended — they are signed out everywhere and
            cannot sign in.
            {user.suspended_reason ? <> Reason: {user.suspended_reason}.</> : null}
          </div>
        ) : null}

        <section className="space-y-3">
          <SectionTitle>Activity</SectionTitle>
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
                  icon={card.icon}
                  tone={card.tone}
                  className={cn("h-full", hoverLift)}
                />
              </div>
            ))}
          </div>
        </section>

        {user?.interests?.length ? (
          <section className="space-y-3">
            <SectionTitle>Interests</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest) => (
                <Badge key={interest.id} variant="outline">
                  {interest.name}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <Tabs defaultValue="clubs">
          <TabsList>
            <TabsTrigger value="clubs">Clubs followed</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
          </TabsList>
          <TabsContent value="clubs">
            <ClubsTab userId={userId} />
          </TabsContent>
          <TabsContent value="events">
            <EventsTab userId={userId} />
          </TabsContent>
          <TabsContent value="badges">
            <BadgesTab userId={userId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
