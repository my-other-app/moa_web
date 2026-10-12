"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { SearchIcon, UsersIcon } from "lucide-react";
import { formatDate, formatNumber, pickImage, relativeTime } from "@moa/app-kit";
import { CardLabel, EmptyState, FigurePanel, InitialsAvatar, Pager, Skeleton, StatTile } from "@moa/ui";

import { useClubFollowers } from "../queries";
import { followersPerDay, type Follower } from "../schemas";

/**
 * Who follows the club, and when they came.
 *
 * Three figures first — how many, how many this month, the newest — then
 * the joins over the page in hand as bars, then the people. The list is
 * narrowed on the page you are looking at: the endpoint takes no search, so
 * pretending to search everyone would be a lie.
 */
const PAGE_SIZE = 24;

function name(follower: Follower): string {
  return follower.user.profile?.full_name || follower.user.full_name || follower.user.username || "Someone";
}

function inDays(iso: string | null | undefined, days: number, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && now - t <= days * 86_400_000;
}

export function FollowersPanel({ clubId, total }: { clubId: number | null | undefined; total?: number | null }) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const { data, isPending, isError } = useClubFollowers(clubId, { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  const followers = data?.items ?? [];
  const count = data?.total ?? total ?? null;
  // Read once on mount: a clock read during render would be a different value on every pass.
  const [now] = React.useState(() => Date.now());
  const thisMonth = followers.filter((f) => inDays(f.created_at, 30, now)).length;
  const newest = followers[0];
  const trend = followersPerDay(followers);
  const busiest = Math.max(1, ...trend.map((p) => p.count));
  const term = search.trim().toLowerCase();
  const shown = term ? followers.filter((f) => name(f).toLowerCase().includes(term)) : followers;

  if (isPending) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[126px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState tone="muted" title="Could not load followers" description="Try reloading the page." />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <StatTile label="Followers" value={count === null ? formatNumber(followers.length) : formatNumber(count)} note="are told when you publish an event" />
        <StatTile label="New this month" value={formatNumber(thisMonth)} note={page === 1 ? "in the last 30 days" : "on this page, in the last 30 days"} trend={thisMonth > 0 ? "up" : "none"} />
        <StatTile label="Newest" value={newest ? name(newest).split(" ")[0]! : "—"} note={newest?.created_at ? `joined ${relativeTime(newest.created_at)}` : "nobody yet"} />
      </div>

      {trend.length > 1 ? (
        <FigurePanel>
          <CardLabel className="mb-3" right={<span className="text-ink-3 text-[11px]">{formatNumber(followers.length)} on this page across {formatNumber(trend.length)} days</span>}>
            Joins over this page
          </CardLabel>
          <div className="flex h-16 items-end gap-[3px]" aria-label="Followers joined per day">
            {trend.map((point) => (
              <span key={point.date} title={`${point.date}: ${point.count}`} className="bg-brand/75 hover:bg-brand flex-1 rounded-t-[2px] transition-colors" style={{ height: `${Math.max(6, (point.count / busiest) * 100)}%` }} />
            ))}
          </div>
          <div className="text-ink-3 mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.04em] uppercase">
            <span>{formatDate(trend[0]!.date)}</span>
            <span>{formatDate(trend[trend.length - 1]!.date)}</span>
          </div>
        </FigurePanel>
      ) : null}

      <FigurePanel className="p-0">
        <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <CardLabel>People</CardLabel>
          <label className="bg-sunken text-ink-2 flex h-8 w-full items-center gap-2 rounded-full px-3 sm:w-64">
            <SearchIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter this page"
              aria-label="Filter followers on this page"
              className="text-ink placeholder:text-ink-3 w-full bg-transparent text-[12.5px] outline-none"
            />
          </label>
        </div>
        {followers.length === 0 ? (
          <EmptyState tone="default" icon={<UsersIcon />} title="No followers yet" description="People who follow your club are told when you publish an event." />
        ) : shown.length === 0 ? (
          <EmptyState tone="default" title="Nobody on this page matches" description="The filter applies to the page you are looking at." />
        ) : (
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {shown.map((follower) => {
              const avatar = pickImage(follower.user.profile?.avatar, ["thumbnail", "medium"]);
              return (
                <li key={follower.user.id} className="border-line-soft border-t sm:[&:nth-child(-n+2)]:border-t-0">
                  <Link href={`/followers/${follower.user.id}`} className="hover:bg-sunken flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors" aria-label={`Open ${name(follower)}`}>
                    {avatar ? <Image src={avatar} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-cover" unoptimized /> : <InitialsAvatar name={name(follower)} size={32} />}
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-[13px] font-medium">{name(follower)}</span>
                      {follower.user.username ? <span className="text-ink-3 block truncate font-mono text-[11px]">@{follower.user.username}</span> : null}
                    </span>
                    {follower.created_at ? <span className="text-ink-3 shrink-0 font-mono text-[11px]">{formatDate(follower.created_at)}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {count !== null && count > 0 ? (
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager page={page} pageCount={Math.ceil(count / PAGE_SIZE)} total={count} pageSize={PAGE_SIZE} noun={["follower", "followers"]} onPage={setPage} />
          </div>
        ) : null}
      </FigurePanel>
    </div>
  );
}
