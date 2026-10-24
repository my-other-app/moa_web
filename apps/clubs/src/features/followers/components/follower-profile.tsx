"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PersonAvatar, formatDate, formatDateTime, relativeTime } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, Skeleton, StatTile } from "@moa/ui";

import { useMyClub } from "@/features/club";

import { useFollowerProfile } from "../queries";

/**
 * One follower, as far as the club may know them: who they are, when they
 * followed, what they gave the club at a registration, and every event of
 * the club they signed up for — with whether they came and what they paid.
 */
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function FollowerProfileView({ userId }: { userId: number }) {
  const { data: club } = useMyClub();
  const q = useFollowerProfile(club?.id, userId);
  const [now] = React.useState(() => new Date());
  const p = q.data;

  if (q.isError) {
    // The API says why; only "not a follower" means they left. Anything else
    // (a server not yet carrying this route, a network fault) is said as such.
    const why = q.error instanceof Error ? q.error.message : "";
    const left = /not a follower/i.test(why);
    return <EmptyState tone="muted" title={left ? "Not a follower of your club" : "Could not load this follower"} description={left ? "They may have unfollowed, or the link is old." : why || "Try reloading the page."} />;
  }
  if (!p) {
    return (
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-[140px] rounded-2xl" />
        <Skeleton className="h-[240px] rounded-2xl" />
      </div>
    );
  }
  const name = p.user.full_name || p.user.username || "Someone";

  return (
    <div className="flex flex-col gap-3.5">
      <Link href="/followers" className="text-ink-2 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> All followers
      </Link>
      <FigurePanel className="flex flex-wrap items-center gap-4 p-4">
        <PersonAvatar name={name} avatar={p.user.avatar} size="medium" className="size-16 rounded-2xl" fallbackClassName="bg-brand/10 text-brand rounded-2xl font-mono text-[24px] font-semibold" />
        <div className="min-w-0 flex-1">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">{name}</h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {p.user.username ? <span className="font-mono">@{p.user.username}</span> : null}
            {p.user.username && p.user.org ? " · " : ""}
            {p.user.org ?? ""}
            {p.followed_at ? ` · following since ${formatDate(p.followed_at)} (${relativeTime(p.followed_at, now)})` : ""}
          </p>
          {p.user.interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.user.interests.map((i) => (
                <Chip key={i}>{i}</Chip>
              ))}
            </div>
          )}
        </div>
      </FigurePanel>

      <div className="grid gap-3.5 sm:grid-cols-3">
        <StatTile label="Registrations" value={p.totals.registrations} note="for your events" />
        <StatTile label="Came through the door" value={p.totals.attended} note={p.totals.registrations > 0 ? `${Math.round((p.totals.attended * 100) / p.totals.registrations)}% of registrations` : "no registrations yet"} />
        <StatTile label="Paid you" value={INR.format(p.totals.paid)} note="in tickets, over time" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <FigurePanel className="overflow-hidden">
          <div className="px-4 pt-4">
            <CardLabel>Your events they signed up for</CardLabel>
          </div>
          {p.events.length === 0 ? (
            <p className="text-ink-3 px-4 pb-4 pt-3 text-[13px]">None yet. They follow you, but have not registered for anything.</p>
          ) : (
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="border-line-soft border-b">
                  <th className="eyebrow px-4 py-2 text-left">Event</th>
                  <th className="eyebrow px-3 py-2 text-left">Registered</th>
                  <th className="eyebrow px-3 py-2 text-right">Paid</th>
                  <th className="eyebrow px-3 py-2 text-right">Attended</th>
                </tr>
              </thead>
              <tbody>
                {p.events.map((e) => (
                  <tr key={e.event_id} className="border-line-soft border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/events/${e.event_id}`} className="text-ink font-medium hover:underline">
                        {e.name}
                      </Link>
                      <div className="text-ink-3 micro mt-0.5">{e.starts_at ? formatDateTime(e.starts_at) : "—"}</div>
                    </td>
                    <td className="text-ink-2 px-3 py-2.5 whitespace-nowrap">{e.registered_at ? formatDate(e.registered_at) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{e.paid ? INR.format(e.paid_amount) : <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">{e.attended ? <Chip tone="admit">Came</Chip> : <Chip>Did not</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FigurePanel>
        <FigurePanel className="p-4">
          <CardLabel>Contact</CardLabel>
          {p.contact.email || p.contact.phone ? (
            <dl className="mt-3 flex flex-col gap-2 text-[13px]">
              {p.contact.email && (
                <div>
                  <dt className="eyebrow">Email</dt>
                  <dd className="text-ink mt-0.5 break-all">
                    <a href={`mailto:${p.contact.email}`} className="hover:underline">
                      {p.contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {p.contact.phone && (
                <div>
                  <dt className="eyebrow">Phone</dt>
                  <dd className="text-ink mt-0.5 font-mono">{p.contact.phone}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-ink-3 mt-3 text-[13px]">Nothing yet. A contact appears here once they register for one of your events, where they give it to you.</p>
          )}
        </FigurePanel>
      </div>
    </div>
  );
}
