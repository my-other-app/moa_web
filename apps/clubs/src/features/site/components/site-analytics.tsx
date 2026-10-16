"use client";

import * as React from "react";
import Link from "next/link";
import { CopyIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Button, CardLabel, FigurePanel, ProgressBar, Segmented, Skeleton, StatTile, toast } from "@moa/ui";

import { useSiteAnalytics } from "../queries";
import type { SiteAnalytics as Analytics } from "../schemas";

/**
 * What the website brought: visits, who sent them, and the sign-ups after.
 *
 * Every visit is counted once, as an opening of one of the club's links:
 * one the club made (an Instagram bio, a poster QR — they land on the site)
 * or the site's own, which counts what came some other way. Sign-ups are
 * the registrations those links are credited with — the site's event
 * buttons carry its own code, so a sign-up that starts on the site counts.
 */
const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

function delta(value: number | null): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null) return { trend: "none" };
  return { delta: `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`, trend: value > 0 ? "up" : value < 0 ? "down" : "none" };
}

function Days({ a }: { a: Analytics }) {
  const top = Math.max(1, ...a.series.map((p) => p.visits));
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 text-[11px]">Visits · sign-ups</span>}>Day by day</CardLabel>
      <div className="mt-4 flex h-[120px] items-end gap-[3px]" role="img" aria-label={`Visits per day over ${a.days} days`}>
        {a.series.map((p) => (
          <div key={p.day} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${p.day}: ${p.visits} visits, ${p.signups} sign-ups`}>
            <div className="bg-brand-soft border-brand-line rounded-t-[3px] border" style={{ height: `${Math.max(p.visits ? 4 : 0, (100 * p.visits) / top)}%` }} />
            {p.signups > 0 ? <span className="bg-admit absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full" /> : null}
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-2 flex justify-between font-mono text-[10.5px]">
        <span>{a.series[0]?.day ?? ""}</span>
        <span>today</span>
      </div>
    </FigurePanel>
  );
}

function Sources({ a }: { a: Analytics }) {
  const top = Math.max(1, ...a.sources.map((s) => s.visits));
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<Link href="/links" className="text-brand text-[11.5px] hover:underline">Tracking links</Link>}>Where visitors came from</CardLabel>
      {a.sources.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">No visits in this period yet. Share the site&apos;s link below, or make a link for each place you post it.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {a.sources.map((s) => (
            <li key={s.link_id}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink min-w-0 truncate">{s.name}</span>
                <span className="text-ink-3 shrink-0 font-mono text-[11.5px] tabular-nums">
                  {formatNumber(s.visits)} visits · {formatNumber(s.signups)} sign-ups
                </span>
              </div>
              <ProgressBar value={s.visits} max={top} tone={s.kind === "website" ? "muted" : "accent"} className="mt-1.5" height={6} label={`${s.name}: ${s.visits} visits`} />
            </li>
          ))}
        </ul>
      )}
      {a.referrers.length > 0 ? (
        <div className="border-line-soft mt-4 border-t pt-3">
          <p className="eyebrow m-0">Found it on their own, from</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {a.referrers.map((r) => (
              <li key={r.referrer} className="text-ink-2">
                {r.referrer} <span className="text-ink-3 font-mono text-[11.5px]">{formatNumber(r.visits)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </FigurePanel>
  );
}

function Events({ a }: { a: Analytics }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel>What they signed up for</CardLabel>
      {a.events.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">No sign-ups from the site in this period. Every Register button on the site is tracked, so they show here as they come.</p>
      ) : (
        <ul className="mt-3 grid">
          {a.events.map((e) => (
            <li key={e.event_id} className="border-line-soft flex items-baseline justify-between gap-3 border-b py-2 text-[13px] last:border-0">
              <Link href={`/events/${e.event_id}`} className="text-ink min-w-0 truncate hover:underline">
                {e.name}
              </Link>
              <span className="text-ink-3 shrink-0 font-mono text-[11.5px] tabular-nums">
                {formatNumber(e.signups)} signed up · {formatNumber(e.came)} came
              </span>
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

function ShareLink({ url }: { url: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Site link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };
  return (
    <div className="border-brand-line bg-brand-soft flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink m-0 text-[13px] font-medium">Share the site with its own short link</p>
        <p className="text-ink-3 m-0 truncate font-mono text-[12px]">{url.replace(/^https?:\/\//, "")}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        <CopyIcon className="size-3.5" /> Copy
      </Button>
    </div>
  );
}

export function SiteAnalytics({ published }: { published: boolean }) {
  const [days, setDays] = React.useState("30");
  const q = useSiteAnalytics(Number(days), published);
  // A server without site tracking (or a site not yet published) has nothing to show here.
  if (!published || q.isError) return null;
  const a = q.data;

  return (
    <section className="grid gap-4" aria-label="How the site is doing">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink m-0 text-[15px] font-semibold tracking-[-0.01em]">How the site is doing</h2>
          <p className="text-ink-3 mt-0.5 text-[12.5px]">Every visit counted once, by where it came from; every Register button on the site is tracked.</p>
        </div>
        <Segmented label="Period" value={days} options={PERIODS} onChange={setDays} />
      </div>
      {!a ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Visits" value={formatNumber(a.visits)} {...delta(a.deltas.visits)} note={`${formatNumber(a.visitors)} different people`} />
            <StatTile label="Sign-ups from the site" value={formatNumber(a.signups)} {...delta(a.deltas.signups)} note={`${formatNumber(a.came)} came to the event`} />
            <StatTile label="Sign-up rate" value={`${a.rate}%`} note="Sign-ups per hundred visits" />
            <StatTile label="On phones" value={`${a.visits ? Math.round((100 * (a.devices.find((d) => d.device === "phone")?.visits ?? 0)) / a.visits) : 0}%`} note="Of the visits in this period" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Days a={a} />
            <Sources a={a} />
          </div>
          <Events a={a} />
          {a.link ? <ShareLink url={a.link.short_url} /> : null}
        </>
      )}
    </section>
  );
}
