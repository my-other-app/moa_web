"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheckIcon,
  CalendarDaysIcon,
  StarIcon,
  UsersIcon,
} from "lucide-react";
import { formatNumber, initials, pickImage } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  Skeleton,
  StatCard,
  cn,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useMyClub } from "../queries";

export function ClubOverview() {
  const { data: club, isPending, isError } = useMyClub();

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
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

  const stats = [
    {
      label: "Followers",
      value: formatNumber(club.followers_count ?? 0),
      icon: <UsersIcon />,
    },
    {
      label: "Total events",
      value: formatNumber(club.total_events ?? 0),
      icon: <CalendarDaysIcon />,
    },
    {
      label: "Live events",
      value: formatNumber(club.live_events ?? 0),
      icon: <CalendarCheckIcon />,
      tone: (club.live_events ?? 0) > 0 ? ("success" as const) : undefined,
    },
    {
      label: "Rating",
      value:
        club.total_ratings && club.total_ratings > 0
          ? `${(club.rating ?? 0).toFixed(1)} / 5`
          : "--",
      caption:
        club.total_ratings && club.total_ratings > 0
          ? `${formatNumber(club.total_ratings)} ratings`
          : "No ratings yet",
      icon: <StarIcon />,
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
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={stagger(i)}
            className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
          >
            <StatCard
              label={stat.label}
              value={stat.value}
              caption={stat.caption}
              icon={stat.icon}
              tone={stat.tone}
              className={cn("h-full", hoverLift)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
