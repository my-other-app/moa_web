"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CalendarDaysIcon,
  StarIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";
import { formatNumber, initials, pickImage } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  MetricCard,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useClubEvents } from "@/features/events";
import { useMyClub } from "../queries";
import {
  byDateAscending,
  isUpcoming,
  needsAttendance,
  summariseReach,
} from "../insights";
import { ClubAttentionPanel } from "./club-attention-panel";
import { NextEventCard } from "./next-event-card";
import { ReachPanel } from "./reach-panel";
import { UpcomingEventsPanel } from "./upcoming-events-panel";

/**
 * The club's own dashboard.
 *
 * It was a profile card and four counters -- followers, total events, live
 * events, rating. All true, none of them answering what a club opens this page
 * to find out: what is next, is it filling, and is anything waiting on me.
 *
 * Both event lists are fetched here and shared downward rather than each panel
 * fetching its own, so every figure on the screen describes the same moment.
 */
const PAGE = { offset: 0, limit: 100 };

export function ClubOverview() {
  const { data: club, isPending, isError } = useMyClub();
  const upcoming = useClubEvents({ ...PAGE, isEnded: false });
  const past = useClubEvents({ ...PAGE, isEnded: true });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[8.5rem] w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !club) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-sm">
          Could not load your club. If this persists, your account may not be
          linked to a club yet.
        </p>
      </Card>
    );
  }

  const logo = pickImage(club.logo, ["medium", "thumbnail", "original"]);

  const upcomingEvents = (upcoming.data?.items ?? [])
    .filter((event) => isUpcoming(event))
    .sort(byDateAscending);
  const [nextEvent, ...laterEvents] = upcomingEvents;

  const pastEvents = past.data?.items ?? [];
  const unmarked = pastEvents.filter((event) => needsAttendance(event));
  const reach = summariseReach([...upcomingEvents, ...pastEvents]);

  const upcomingRegistrations = upcomingEvents.reduce(
    (sum, event) => sum + (event.registration_count ?? 0),
    0,
  );

  const metrics = [
    {
      label: "Followers",
      value: formatNumber(club.followers_count ?? 0),
      icon: <UsersIcon />,
      tone: "brand" as const,
      caption: "people who see your events",
    },
    {
      label: "Upcoming events",
      value: formatNumber(upcomingEvents.length),
      icon: <CalendarDaysIcon />,
      tone: "info" as const,
      caption:
        unmarked.length > 0
          ? `${formatNumber(unmarked.length)} need attendance`
          : `${formatNumber(pastEvents.length)} held so far`,
    },
    {
      label: "Registrations ahead",
      value: formatNumber(upcomingRegistrations),
      icon: <TicketIcon />,
      tone: "success" as const,
      caption: "across upcoming events",
    },
    {
      label: "Rating",
      value:
        club.total_ratings && club.total_ratings > 0
          ? (club.rating ?? 0).toFixed(1)
          : "--",
      unit: club.total_ratings && club.total_ratings > 0 ? "/ 5" : undefined,
      icon: <StarIcon />,
      tone: "warning" as const,
      caption:
        club.total_ratings && club.total_ratings > 0
          ? `${formatNumber(club.total_ratings)} ratings`
          : "no ratings yet",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="animate-in fade-in-0 slide-in-from-bottom-2 overflow-hidden duration-500 motion-reduce:animate-none">
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
                {initials(club.name)}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{club.name}</h2>
            <p className="text-muted-foreground truncate text-sm">
              {club.location_name || "No location set"}
            </p>
            {club.about ? (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm text-pretty">
                {club.about}
              </p>
            ) : null}
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link href="/profile">Edit profile</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, i) => (
          <div
            key={metric.label}
            style={stagger(i)}
            className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
          >
            <MetricCard
              label={metric.label}
              value={metric.value}
              unit={metric.unit}
              icon={metric.icon}
              tone={metric.tone}
              caption={metric.caption}
              className={cn("h-full", hoverLift)}
            />
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {nextEvent ? <NextEventCard event={nextEvent} /> : null}
          <UpcomingEventsPanel events={nextEvent ? laterEvents : []} />
        </div>

        <div className="space-y-6">
          <ClubAttentionPanel events={unmarked} />
          <ReachPanel reach={reach} />
        </div>
      </div>
    </div>
  );
}
