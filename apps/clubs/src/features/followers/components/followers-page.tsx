"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DownloadIcon, MegaphoneIcon, SearchIcon, UsersIcon } from "lucide-react";
import { formatDate, formatNumber, pickImage, relativeTime, useListParams } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, InitialsAvatar, Notice, Pager, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { followersExportUrl } from "../api";
import { useFollowersInsights, useFollowersList } from "../queries";
import { SEGMENTS, SEGMENT_HINT, SEGMENT_LABEL, SORTS, SORT_LABEL, type FollowerRow, type FollowerSort, type FollowersInsights, type Segment } from "../schemas";

/**
 * Followers, rebuilt around what a club plans from.
 *
 * One line on the audience and four figures; the audience over a year and
 * what it is made of (where from, what they care about, which link brought
 * them); then the people, in segments a club can act on — the new, the
 * regulars, the ones who came once, the ones who never did, the ones gone
 * quiet — each row saying what that person did with the club.
 */
const PAGE_SIZE = 24;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function Growth({ growth }: { growth: FollowersInsights["growth"] }) {
  const max = Math.max(1, ...growth.map((g) => g.joined));
  const first = growth[0]?.total ?? 0;
  const last = growth[growth.length - 1]?.total ?? 0;
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{first === last ? `${formatNumber(last)} all year` : `${formatNumber(first)} → ${formatNumber(last)} over the year`}</span>}>Followers over the year</CardLabel>
      <div className="mt-3 flex h-[88px] items-end gap-1.5" aria-label="Followers joined per month">
        {growth.map((g) => (
          <div key={g.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${g.month}: ${g.joined} joined, ${g.total} in all`}>
            <span className="text-ink-3 font-mono text-[9.5px] tabular-nums">{g.joined || ""}</span>
            <span className={cn("w-full rounded-t-[3px]", g.joined ? "bg-brand" : "bg-sunken")} style={{ height: `${Math.max(4, (g.joined / max) * 64)}px` }} />
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.06em] uppercase">
        {growth.map((g) => (
          <span key={g.month} className="flex-1 text-center">
            {MONTHS[Number(g.month.slice(5)) - 1]}
          </span>
        ))}
      </div>
    </FigurePanel>
  );
}

function Breakdown({ title, rows, total, empty }: { title: string; rows: { name: string; count: number }[]; total: number; empty: string }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel>{title}</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-ink truncate">{r.name}</span>
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                  {r.count} · {pct(r.count, total)}%
                </span>
              </div>
              <ProgressBar value={r.count} max={Math.max(1, total)} tone="accent" className="mt-1" />
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

function Row({ f, now }: { f: FollowerRow; now: number }) {
  const avatar = pickImage(f.user.avatar, ["thumbnail", "medium"]);
  const seen = f.last_registered_at ?? f.followed_at;
  const did = f.registrations === 0 ? "No events yet" : `${f.attended} of ${f.registrations} ${f.registrations === 1 ? "event" : "events"} attended`;
  const tag = f.upcoming > 0 ? { text: "In for the next", tone: "text-admit" } : f.segments.includes("quiet") ? { text: "Gone quiet", tone: "text-caution" } : f.segments.includes("new") ? { text: "New", tone: "text-brand" } : null;
  return (
    <li className="border-line-soft border-t first:border-t-0">
      <Link href={`/followers/${f.user.id}`} className="hover:bg-sunken grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_120px_96px]" aria-label={`Open ${f.user.full_name}`}>
        {avatar ? <Image src={avatar} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" unoptimized /> : <InitialsAvatar name={f.user.full_name} size={36} />}
        <span className="min-w-0">
          <span className="text-ink block truncate text-[13.5px] font-medium">
            {f.user.full_name}
            {tag ? <span className={cn("ml-2 font-mono text-[10px] tracking-[0.06em] uppercase", tag.tone)}>{tag.text}</span> : null}
          </span>
          <span className="text-ink-3 block truncate text-[11.5px]">
            {f.org || (f.user.username ? `@${f.user.username}` : "")}
            {f.interests.length > 0 ? ` · ${f.interests.slice(0, 3).join(", ")}` : ""}
          </span>
        </span>
        <span className="text-ink-2 hidden truncate text-[12.5px] sm:block">{did}</span>
        <span className="text-ink-3 hidden font-mono text-[11px] sm:block" title={seen ? formatDate(seen) : undefined}>
          {seen ? `seen ${relativeTime(seen, new Date(now))}` : "—"}
        </span>
        <span className="text-ink-3 shrink-0 text-right font-mono text-[11px]" title={f.source ? `Came via ${f.source}` : undefined}>
          {f.followed_at ? formatDate(f.followed_at) : ""}
        </span>
      </Link>
    </li>
  );
}

export function FollowersPage() {
  const params = useListParams({ pageSize: PAGE_SIZE });
  const search = useSearchParams();
  const segment: Segment = (SEGMENTS as readonly string[]).includes(search.get("segment") ?? "") ? (search.get("segment") as Segment) : "all";
  const sort: FollowerSort = (SORTS as readonly string[]).includes(search.get("sort") ?? "") ? (search.get("sort") as FollowerSort) : segment === "regulars" ? "active" : "newest";
  const [now] = React.useState(() => Date.now());
  const insights = useFollowersInsights();
  const list = useFollowersList({ segment, sort, search: params.search || undefined, offset: (params.page - 1) * params.pageSize, limit: params.pageSize });
  const i = insights.data;
  const counts = list.data?.counts ?? i?.segments ?? {};
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Followers</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {i ? `${formatNumber(i.total)} ${i.total === 1 ? "person" : "people"} · ${pct(i.came, i.total)}% have been to an event · ${i.new} new this month` : "The people told when you publish an event."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={followersExportUrl(segment)} className="btn btn-secondary" download>
            <DownloadIcon className="size-4" /> Export {segment === "all" ? "all" : SEGMENT_LABEL[segment].toLowerCase()}
          </a>
          <Link href="/announcements" className="btn btn-primary">
            <MegaphoneIcon className="size-4" /> Send an announcement
          </Link>
        </div>
      </div>

      {insights.isPending ? (
        <Skeleton className="h-[108px]" />
      ) : i ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Followers" value={formatNumber(i.total)} note={i.new ? `+${i.new} in 30 days` : "none new in 30 days"} delta={i.new_delta !== null && i.new_delta !== undefined && i.new_delta !== 0 ? `${i.new_delta > 0 ? "+" : ""}${i.new_delta} vs prior 30` : undefined} trend={i.new_delta ? (i.new_delta > 0 ? "up" : "down") : "none"} />
          <StatTile label="Have come to an event" value={`${pct(i.came, i.total)}%`} note={`${formatNumber(i.came)} people · ${formatNumber(i.regulars)} regulars`} />
          <StatTile label={i.next_event ? "In for the next event" : "In for something ahead"} value={formatNumber(i.registered_ahead)} note={i.next_event ? i.next_event.name : "nothing scheduled"} action={i.next_event ? { label: "Guest list", href: `/events/${i.next_event.id}/attendees` } : undefined} linkAs={Link} />
          <StatTile label="Gone quiet" value={formatNumber(i.quiet)} note="nothing in 90 days" scale={i.quiet > 0 && i.quiet >= i.total / 3 ? "hero" : "sm"} action={i.quiet > 0 ? { label: "See who", href: "/followers?segment=quiet" } : undefined} linkAs={Link} />
        </div>
      ) : null}

      {i && i.quiet > 0 && i.quiet >= i.total / 3 ? (
        <Notice tone="caution" tag="Reach" action={<Link href="/announcements" className="btn btn-secondary text-[12px]">Announce something</Link>}>
          {i.quiet} of {i.total} followers have not done anything with the club in three months. An announcement or the next event is how they hear from you again.
        </Notice>
      ) : null}

      {i ? (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <Growth growth={i.growth} />
          <div className="grid gap-3">
            <Breakdown title="Where they are from" rows={i.by_org.filter((r) => r.name !== "Not given")} total={i.total} empty="Nobody has named a college or an organisation yet." />
          </div>
          <Breakdown title="What they care about" rows={i.interests} total={i.total} empty="No topics picked yet. Topics on your events help here." />
          <Breakdown title="Which link brought them" rows={i.sources} total={i.total} empty="Nobody arrived by a tracking link yet." />
        </div>
      ) : null}

      <FigurePanel className="p-0">
        <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which followers">
            {SEGMENTS.map((s) => (
              <Chip key={s} active={segment === s} onClick={() => params.setParam("segment", s === "all" ? undefined : s)}>
                {SEGMENT_LABEL[s]}
                {counts[s] ? ` ${counts[s]}` : ""}
              </Chip>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="bg-sunken text-ink-2 flex h-9 items-center gap-2 rounded-full px-3 sm:w-56">
              <SearchIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <input value={params.searchInput} onChange={(e) => params.setSearchInput(e.target.value)} onBlur={() => params.commitSearch(params.searchInput)} onKeyDown={(e) => (e.key === "Enter" ? params.commitSearch(params.searchInput) : null)} placeholder="Name, handle or college" aria-label="Search followers" className="text-ink placeholder:text-ink-3 w-full bg-transparent text-[12.5px] outline-none" />
            </label>
            <select className="input h-9" aria-label="Sort" value={sort} onChange={(e) => params.setParam("sort", e.target.value)}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-ink-3 border-line-soft border-b px-4 py-2 text-[12px]">{SEGMENT_HINT[segment]}</p>
        {list.isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, k) => (
              <Skeleton key={k} className="h-12" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState tone="muted" title="Could not load followers" description="Try reloading the page." />
        ) : rows.length === 0 ? (
          <EmptyState tone="default" icon={<UsersIcon />} title={params.search ? "Nobody matches" : segment === "all" ? "No followers yet" : `Nobody here`} description={params.search ? "Try another name, or widen the segment." : segment === "all" ? "People who follow your club are told when you publish an event. Share your club page to grow it." : SEGMENT_HINT[segment]} />
        ) : (
          <ul>
            {rows.map((f) => (
              <Row key={f.user.id} f={f} now={now} />
            ))}
          </ul>
        )}
        {total > 0 ? (
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager page={params.page} pageCount={Math.max(1, Math.ceil(total / params.pageSize))} total={total} pageSize={params.pageSize} noun={["follower", "followers"]} onPage={params.setPage} busy={list.isFetching} />
          </div>
        ) : null}
      </FigurePanel>
    </div>
  );
}
