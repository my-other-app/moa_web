"use client";

import * as React from "react";
import Image from "next/image";
import { UsersIcon } from "lucide-react";
import { formatDate, formatNumber, initials, pickImage } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Pagination,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useClubFollowers } from "../queries";
import { followersPerDay, type Follower } from "../schemas";

/**
 * Who follows the club.
 *
 * The count was on the overview from the start and the list behind it was
 * never reachable, so "342 followers" was a number with nothing underneath --
 * no way to see who they are or when they arrived.
 */
const PAGE_SIZE = 20;

function name(follower: Follower): string {
  return (
    follower.user.profile?.full_name ||
    follower.user.full_name ||
    follower.user.username ||
    "Someone"
  );
}

export function FollowersPanel({ clubId }: { clubId: number | null | undefined }) {
  const [page, setPage] = React.useState(0);
  const [search, setSearch] = React.useState("");

  const { data, isPending, isError } = useClubFollowers(clubId, {
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const followers = data?.items ?? [];

  /*
   * Joins per day, over the page in hand.
   *
   * Every follower row carries created_at and nothing had ever read it, so a
   * club could see 342 and not whether that was rising. It is scoped to the
   * loaded page and labelled that way rather than implying a full history --
   * the endpoint pages, so a trend drawn from one page describes the page.
   */
  const trend = followersPerDay(followers);
  const busiestDay = Math.max(1, ...trend.map((point) => point.count));
  // Filtered on the page in hand: the endpoint takes no search parameter, so
  // this narrows what is shown rather than pretending to search everyone.
  const term = search.trim().toLowerCase();
  const shown = term
    ? followers.filter((f) => name(f).toLowerCase().includes(term))
    : followers;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Followers</CardTitle>
            <CardDescription>
              {data?.total != null
                ? `${formatNumber(data.total)} people follow this club.`
                : "People who follow this club see your events."}
            </CardDescription>
          </div>
          {/* A plain input, not SearchInput: that one debounces for a server
              query, and this filters rows already on screen. */}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter this page…"
            aria-label="Filter followers on this page"
            className="w-full sm:w-56"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isPending && !isError && trend.length > 1 ? (
          <div className="bg-muted/40 space-y-2.5 rounded-xl p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium">Joins over this page</p>
              <p className="text-muted-foreground text-xs">
                {formatNumber(followers.length)} followers across{" "}
                {formatNumber(trend.length)} days
              </p>
            </div>
            <div className="flex h-20 items-end gap-1">
              {trend.map((point) => (
                <div
                  key={point.date}
                  className="group flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${point.date}: ${point.count}`}
                >
                  <span
                    className="bg-brand/80 group-hover:bg-brand w-full rounded-t-sm transition-colors"
                    style={{
                      // A floor of 4px so a day with one follower is still a
                      // visible mark rather than an invisible sliver.
                      height: `${Math.max(4, (point.count / busiestDay) * 64)}px`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="text-muted-foreground flex justify-between text-[11px]">
              <span>{trend[0]?.date}</span>
              <span>{trend[trend.length - 1]?.date}</span>
            </div>
          </div>
        ) : null}

        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            tone="muted"
            title="Could not load followers"
            description="Try reloading the page."
          />
        ) : followers.length === 0 ? (
          <EmptyState
            tone="muted"
            icon={<UsersIcon />}
            title="No followers yet"
            description="People who follow your club are notified when you publish an event."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            tone="muted"
            title="Nobody on this page matches"
            description="The filter applies to the page you are looking at."
          />
        ) : (
          <div className="space-y-2">
            {shown.map((follower, i) => {
              const avatar = pickImage(follower.user.profile?.avatar, [
                "thumbnail",
                "medium",
              ]);
              return (
                <div
                  key={follower.user.id}
                  style={stagger(i)}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                    hoverLift
                  )}
                >
                  {avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="size-9 shrink-0 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-[11px]">
                        {initials(name(follower))}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name(follower)}</p>
                    {follower.user.username ? (
                      <p className="text-muted-foreground truncate text-xs">
                        @{follower.user.username}
                      </p>
                    ) : null}
                  </div>
                  {follower.created_at ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      since {formatDate(follower.created_at)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {data?.total != null && data.total > PAGE_SIZE ? (
          <Pagination
            page={page}
            pageCount={Math.ceil(data.total / PAGE_SIZE)}
            onPageChange={setPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
