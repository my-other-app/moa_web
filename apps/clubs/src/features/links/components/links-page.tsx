"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDownIcon, CopyIcon, LinkIcon, QrCodeIcon } from "lucide-react";
import { formatNumber, relativeTime } from "@moa/app-kit";
import {
  CardLabel,
  Chip,
  cn,
  EmptyState,
  FigurePanel,
  IconButton,
  Notice,
  ProgressBar,
  SearchField,
  Skeleton,
  StatTile,
} from "@moa/ui";

import { LockedNotice } from "@/features/plan";

import { useLinksOverview } from "../queries";
import {
  LINK_SORTS,
  LINK_SORT_LABEL,
  PERIODS,
  TARGETS,
  TARGET_LABEL,
  sourceLabel,
  type LinkRow,
  type LinkScope,
  type LinkSort,
  type LinksOverview,
  type TargetFilter,
} from "../schemas";
import { Bars, LinkDetailPanel } from "./link-detail";
import { NewLinkDialog, copyText } from "./new-link-dialog";

/**
 * Tracking links, rebuilt around the question they answer: which places
 * bring people. One line and four figures on the period; the period day by
 * day and the channels it adds up to; then every link the club made — to
 * its page and to each event — each saying how often it was opened, what
 * it brought, and what those people did next. A link opens under its row
 * with its QR code, its days, its devices and where the openings came
 * from. Making one is a dialog, not the top of the page.
 */
const plural = (noun: string, n: number) => (n === 1 ? noun : `${noun}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function delta(
  value: number | null,
  unit = "%",
): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null || value === 0) return { trend: "none" };
  return {
    delta: `${value > 0 ? "+" : "−"}${Math.abs(value)}${unit} vs prior`,
    trend: value > 0 ? "up" : "down",
  };
}

/** What a link of this scope brings: "sign-ups" when follows and registrations are read together. */
function nounOf(o: LinksOverview) {
  if (o.scope === "event")
    return { one: "registration", many: "registrations" };
  if (o.totals.follows > 0 && o.totals.registrations === 0)
    return { one: "follow", many: "follows" };
  if (o.totals.registrations > 0 && o.totals.follows === 0)
    return { one: "registration", many: "registrations" };
  return { one: "sign-up", many: "sign-ups" };
}

function Series({ o, days }: { o: LinksOverview; days: number }) {
  const total = o.series.reduce((n, p) => n + p.clicks, 0);
  const peak = o.series.reduce<{ date: string; clicks: number } | null>(
    (a, b) => (a === null || b.clicks > a.clicks ? b : a),
    null,
  );
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 font-mono text-[11px]">
            {total
              ? `${formatNumber(total)} opened · ${formatNumber(o.totals.conversions)} brought`
              : ""}
          </span>
        }
      >
        Opened, {o.grain === "month" ? "month by month" : "day by day"}
      </CardLabel>
      {total === 0 ? (
        <p className="text-ink-3 mt-3 py-6 text-center text-[12.5px]">
          {o.totals.links === 0
            ? "Make a link and share it; its openings fill this in."
            : `Nothing opened in the last ${days >= 3650 ? "while" : `${days} days`}. Share a link again, or make one for the next place.`}
        </p>
      ) : (
        <div className="mt-3">
          <Bars
            points={o.series}
            grain={o.grain}
            height={96}
            label={`Openings by ${o.grain}`}
          />
          <p className="text-ink-3 mt-2 text-[11.5px]">
            The light bar is openings, the dark part the {nounOf(o).many} that
            followed.
            {peak && peak.clicks > 0
              ? ` Busiest ${o.grain}: ${new Date(o.grain === "month" ? `${peak.date}-01T00:00:00` : `${peak.date}T00:00:00`).toLocaleString("en-IN", o.grain === "month" ? { month: "long" } : { day: "numeric", month: "long" })}, ${formatNumber(peak.clicks)} opened.`
              : ""}
          </p>
        </div>
      )}
    </FigurePanel>
  );
}

function Channels({ o }: { o: LinksOverview }) {
  const noun = nounOf(o);
  const max = Math.max(
    1,
    ...o.by_source.map((r) => r.conversions),
    ...o.by_source.map((r) => (r.conversions ? 0 : r.clicks / 10)),
  );
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          o.totals.best_source ? (
            <span className="text-admit font-mono text-[11px]">
              best: {sourceLabel(o.totals.best_source.source)}
            </span>
          ) : null
        }
      >
        Channels
      </CardLabel>
      {o.by_source.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">
          Each place you share a link in becomes a channel here, with what it
          brought.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {o.by_source.map((r) => (
            <li key={r.source}>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span
                  className={cn(
                    "text-ink truncate",
                    o.totals.best_source?.source === r.source && "font-medium",
                  )}
                >
                  {sourceLabel(r.source)}{" "}
                  <span className="text-ink-3">
                    · {r.links} {plural("link", r.links)}
                  </span>
                </span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                  {formatNumber(r.clicks)} opened ·{" "}
                  {formatNumber(r.conversions)}{" "}
                  {r.conversions === 1 ? noun.one : noun.many}
                  {r.clicks ? ` · ${r.rate}%` : ""}
                </span>
              </div>
              <ProgressBar
                value={r.conversions || (r.clicks ? r.clicks / 10 : 0)}
                max={max}
                tone={
                  o.totals.best_source?.source === r.source ? "admit" : "accent"
                }
                className="mt-1"
                label={`${sourceLabel(r.source)} ${noun.many}`}
              />
            </li>
          ))}
        </ul>
      )}
      {o.untracked.total > 0 ? (
        <p className="text-ink-3 mt-3 text-[11.5px] leading-[1.5]">
          {formatNumber(o.untracked.conversions)} of{" "}
          {formatNumber(o.untracked.total)}{" "}
          {plural(
            noun.one === "sign-up" ? "sign-up" : noun.one,
            o.untracked.total,
          )}{" "}
          in this period came without a link: the app&apos;s feed, search, and
          the page itself.
        </p>
      ) : null}
    </FigurePanel>
  );
}

function Row({
  scope,
  l,
  open,
  onToggle,
  days,
  grain,
  now,
  showTarget,
}: {
  scope: LinkScope;
  l: LinkRow;
  open: boolean;
  onToggle: () => void;
  days: number;
  grain: "day" | "month";
  now: Date;
  showTarget: boolean;
}) {
  const noun = l.conversion_noun;
  return (
    <li className="border-line-soft border-t first:border-t-0">
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors",
          "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_88px_120px_96px_auto]",
          open ? "bg-sunken/60" : "hover:bg-sunken/40",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} ${l.name}`}
          className="min-w-0 text-left"
        >
          <span className="text-ink flex items-center gap-1.5 truncate text-[13.5px] font-medium">
            <ChevronDownIcon
              className={cn(
                "text-ink-3 size-3.5 shrink-0 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
            <span className="truncate">{l.name}</span>
            {l.kind === "website" ? <span className="tag ml-1">Automatic</span> : null}
            {l.clicks_ever === 0 ? (
              <span className="text-caution ml-1 font-mono text-[10px] tracking-[0.06em] uppercase">
                never opened
              </span>
            ) : null}
          </span>
          <span className="text-ink-3 block truncate pl-5 font-mono text-[11px]">
            {l.url.replace(/^https?:\/\//, "")}
          </span>
        </button>
        <span className="hidden min-w-0 sm:block">
          {showTarget ? (
            l.target.kind === "event" && l.target.id ? (
              <Link
                href={`/events/${l.target.id}`}
                className="text-ink-2 block truncate text-[12.5px] hover:underline"
              >
                {l.target.name}
              </Link>
            ) : l.target.kind === "website" ? (
              <Link href="/website" className="text-ink-2 block truncate text-[12.5px] hover:underline">
                Website
              </Link>
            ) : (
              <span className="text-ink-2 block truncate text-[12.5px]">
                Club page
              </span>
            )
          ) : null}
          <span className="text-ink-3 block truncate text-[11.5px]">
            {sourceLabel(l.utm_source)} / {l.utm_medium}
            {l.utm_content ? ` · ${l.utm_content}` : ""}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="text-ink block font-mono text-[12.5px] tabular-nums">
            {formatNumber(l.clicks)}
          </span>
          <span className="text-ink-3 block text-[11px]">
            {l.uniques === l.clicks
              ? "opened"
              : `${formatNumber(l.uniques)} people`}
          </span>
        </span>
        <span className="hidden sm:block">
          <span className="text-ink block font-mono text-[12.5px] tabular-nums">
            {formatNumber(l.conversions)} {plural(noun, l.conversions)}
          </span>
          <ProgressBar
            value={l.conversions}
            max={Math.max(1, l.clicks)}
            tone={l.rate >= 10 ? "admit" : "accent"}
            className="mt-1 w-24"
            height={5}
            label={`${l.name} ${noun} rate`}
          />
          <span className="text-ink-3 block text-[11px]">
            {l.clicks ? `${l.rate}% of openings` : "not opened yet"}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="text-ink-2 block font-mono text-[12.5px] tabular-nums">
            {formatNumber(l.second)}
          </span>
          <span className="text-ink-3 block text-[11px]">{l.second_noun}</span>
        </span>
        <span className="flex items-center justify-end gap-1">
          <span
            className="text-ink-3 mr-1 hidden font-mono text-[11px] lg:block"
            title={l.last_click_at ?? undefined}
          >
            {l.last_click_at ? relativeTime(l.last_click_at, now) : "—"}
          </span>
          <IconButton
            label={`Copy ${l.name}`}
            onClick={() => void copyText(l.url, "Short link")}
          >
            <CopyIcon />
          </IconButton>
          <IconButton label={`QR code for ${l.name}`} onClick={onToggle}>
            <QrCodeIcon />
          </IconButton>
        </span>
      </div>
      {open ? (
        <LinkDetailPanel scope={scope} link={l} days={days} grain={grain} />
      ) : null}
    </li>
  );
}

function sortRows(rows: LinkRow[], sort: LinkSort) {
  const by: Record<LinkSort, (a: LinkRow, b: LinkRow) => number> = {
    clicks: (a, b) => b.clicks - a.clicks || b.conversions - a.conversions,
    conversions: (a, b) => b.conversions - a.conversions || b.clicks - a.clicks,
    rate: (a, b) =>
      (b.clicks ? b.rate : -1) - (a.clicks ? a.rate : -1) ||
      b.clicks - a.clicks,
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
  };
  return [...rows].sort(by[sort]);
}

export function LinksPage({ scope }: { scope: LinkScope }) {
  const [days, setDays] = React.useState(30);
  const [target, setTarget] = React.useState<TargetFilter>("all");
  const [sort, setSort] = React.useState<LinkSort>("clicks");
  const [search, setSearch] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [now] = React.useState(() => new Date());
  const q = useLinksOverview(scope, days);
  const o = q.data;
  const club = scope.kind === "club";
  const noun = o ? nounOf(o) : { one: "sign-up", many: "sign-ups" };

  const term = search.trim().toLowerCase();
  const rows = o
    ? sortRows(
        o.links.filter(
          (l) =>
            (target === "all" || l.target.kind === target) &&
            (!term ||
              l.name.toLowerCase().includes(term) ||
              l.utm_source.includes(term) ||
              l.target.name.toLowerCase().includes(term)),
        ),
        sort,
      )
    : [];
  const counts = o
    ? {
        all: o.links.length,
        website: o.links.filter((l) => l.target.kind === "website").length,
        club: o.links.filter((l) => l.target.kind === "club").length,
        event: o.links.filter((l) => l.target.kind === "event").length,
      }
    : { all: 0, website: 0, club: 0, event: 0 };
  const periodWord = days >= 3650 ? "all time" : `${days} days`;
  const never = o?.attention.never_opened ?? [];
  const lowShare = o && o.untracked.total >= 10 && o.totals.share_of_all < 30;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={cn(
              "m-0 font-semibold tracking-[-0.02em]",
              club ? "page-title" : "text-[17px]",
            )}
          >
            Tracking links
          </h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {o
              ? o.totals.links === 0
                ? club
                  ? "Short links that say which place each follower and guest came from."
                  : "Short links to this event's page that say which place each guest came from."
                : `${o.totals.links} ${plural("link", o.totals.links)} · ${formatNumber(o.totals.clicks)} opened in ${periodWord} · ${formatNumber(o.totals.conversions)} ${o.totals.conversions === 1 ? noun.one : noun.many} came through them${o.totals.last_click_at ? ` · last opened ${relativeTime(o.totals.last_click_at, now)}` : ""}`
              : club
                ? "Short links that say which place each follower and guest came from."
                : "Short links to this event's page that say which place each guest came from."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input h-9 w-[140px] py-0"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <NewLinkDialog scope={scope} />
        </div>
      </div>

      <LockedNotice feature="links" eventId={scope.kind === "event" ? scope.eventId : null} />

      {q.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the links"
          description="Try reloading the page."
        />
      ) : !o ? (
        <>
          <Skeleton className="h-[108px]" />
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[200px]" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={`Opened, ${periodWord}`}
              value={formatNumber(o.totals.clicks)}
              {...delta(o.deltas.clicks)}
              note={
                o.totals.clicks
                  ? `${formatNumber(o.totals.uniques)} ${o.totals.uniques === 1 ? "person" : "people"} · ${o.totals.links} ${plural("link", o.totals.links)}`
                  : `${o.totals.links} ${plural("link", o.totals.links)}, nothing opened yet`
              }
            />
            <StatTile
              label={`${cap(noun.many)} from links`}
              value={formatNumber(o.totals.conversions)}
              {...delta(o.deltas.conversions)}
              note={
                club
                  ? `${formatNumber(o.totals.follows)} ${plural("follow", o.totals.follows)} · ${formatNumber(o.totals.registrations)} ${plural("registration", o.totals.registrations)}`
                  : `${formatNumber(o.totals.second)} of them checked in`
              }
            />
            <StatTile
              label={`Opened → ${noun.one}`}
              value={o.totals.clicks ? `${o.totals.rate}%` : "—"}
              {...delta(o.deltas.rate_pts, " pts")}
              note={
                o.untracked.total
                  ? `${o.totals.share_of_all}% of all ${noun.many} came by a link`
                  : "of the people who opened a link"
              }
            />
            <StatTile
              label="Best link"
              value={o.totals.best_link ? o.totals.best_link.name : "—"}
              note={
                o.totals.best_link
                  ? `${sourceLabel(o.totals.best_link.source)} · ${formatNumber(o.totals.best_link.conversions)} ${o.totals.best_link.conversions === 1 ? noun.one : noun.many} · ${o.totals.best_link.rate}%`
                  : "no link has brought anyone yet"
              }
              action={
                o.totals.best_link
                  ? {
                      label: "Open",
                      onClick: () => setOpenId(o.totals.best_link?.id ?? null),
                    }
                  : undefined
              }
            />
          </div>

          {never.length > 0 ? (
            <Notice
              tone="caution"
              tag="Unshared"
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOpenId(never[0]?.id ?? null)}
                >
                  Show
                </button>
              }
            >
              {never.length === 1 ? (
                <>
                  “{never[0]?.name}” has never been opened. Share it, or retire
                  it so the list stays honest.
                </>
              ) : (
                <>
                  {never.length} links have never been opened:{" "}
                  {never
                    .slice(0, 3)
                    .map((n) => `“${n.name}”`)
                    .join(", ")}
                  {never.length > 3 ? ` and ${never.length - 3} more` : ""}.
                  Share them, or retire them.
                </>
              )}
            </Notice>
          ) : lowShare ? (
            <Notice tone="neutral" tag="Untracked">
              Only {o.totals.share_of_all}% of {noun.many} in this period came
              through a link. Share a link in every place you post, and this
              page can say which places work.
            </Notice>
          ) : o.totals.best_source && o.by_source.length > 1 ? (
            <Notice tone="admit" tag="Best channel">
              {sourceLabel(o.totals.best_source.source)} brought{" "}
              {formatNumber(o.totals.best_source.conversions)}{" "}
              {o.totals.best_source.conversions === 1 ? noun.one : noun.many}{" "}
              from its links, {o.totals.best_source.rate}% of the people who
              opened one.
            </Notice>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <Series o={o} days={days} />
            <Channels o={o} />
          </div>

          <FigurePanel className="p-0">
            <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
              {club ? (
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Which links"
                >
                  {TARGETS.map((t) => (
                    <Chip
                      key={t}
                      active={target === t}
                      onClick={() => setTarget(t)}
                    >
                      {TARGET_LABEL[t]}
                      {counts[t] ? ` ${counts[t]}` : ""}
                    </Chip>
                  ))}
                </div>
              ) : (
                <CardLabel>Links</CardLabel>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Name, source or event"
                  label="Search links"
                  className="sm:w-52"
                />
                <select
                  className="input"
                  aria-label="Sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as LinkSort)}
                >
                  {LINK_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {LINK_SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {o.links.length > 0 ? (
              <div
                className={cn(
                  "text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid",
                  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_88px_120px_96px_auto]",
                )}
              >
                <span className="pl-5">Link</span>
                <span>{club ? "Points to · channel" : "Channel"}</span>
                <span className="text-right">Opened</span>
                <span>Brought</span>
                <span className="text-right">Then</span>
                <span className="w-[116px] text-right">Last opened</span>
              </div>
            ) : null}
            {o.links.length === 0 ? (
              <EmptyState
                icon={<LinkIcon />}
                title="No links yet"
                description={
                  club
                    ? "Make one for each place you share your club or an event — a story, a group, a poster — and this page says which of them bring people."
                    : "Make one for each place you share this event — a story, a group, a poster — and this page says which of them bring guests."
                }
                action={
                  <NewLinkDialog scope={scope} label="Make the first link" />
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                tone="default"
                size="sm"
                title="Nothing matches"
                description={
                  term
                    ? "Try another word."
                    : `No links point ${target === "club" ? "to the club page" : "to an event"} yet.`
                }
              />
            ) : (
              <ul>
                {rows.map((l) => (
                  <Row
                    key={l.id}
                    scope={scope}
                    l={l}
                    open={openId === l.id}
                    onToggle={() => setOpenId(openId === l.id ? null : l.id)}
                    days={days}
                    grain={o.grain}
                    now={now}
                    showTarget={club}
                  />
                ))}
              </ul>
            )}
            {o.links.length > 0 ? (
              <p className="text-ink-3 border-line-soft border-t px-4 py-2.5 text-[11.5px]">
                Opened counts every visit through the short link; people counts
                each phone or browser once. Brought is the {noun.many} that
                carried the link&apos;s code. Then is what those people did
                next:{" "}
                {club
                  ? "followers who later registered, guests who checked in"
                  : "guests who checked in"}
                .
              </p>
            ) : null}
          </FigurePanel>
        </>
      )}
    </div>
  );
}
