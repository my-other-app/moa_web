"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MegaphoneIcon, RadioIcon, SmartphoneIcon } from "lucide-react";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  relativeTime,
  useListParams,
} from "@moa/app-kit";
import {
  CardLabel,
  Chip,
  EmptyState,
  FigurePanel,
  Notice,
  Pager,
  ProgressBar,
  Skeleton,
  StatTile,
  cn,
  SearchField,
} from "@moa/ui";

import { usePushHistory, usePushInsights } from "../queries";
import {
  AUDIENCE_LABEL,
  PUSH_SCOPES,
  PUSH_SCOPE_LABEL,
  type PushInsights,
  type PushScope,
  type PushSend,
} from "../schemas";
import { NewAnnouncementDialog } from "./new-announcement-dialog";

/**
 * Announcements, rebuilt around what a push is for: reaching the phones of
 * the people who signed up. One line and four figures on the month — sends,
 * phones reached, how many opened, how many within the hour — then when a
 * push lands best and how much of what is coming can be reached at all.
 * Every push the club made is one row, live updates from the room alongside
 * announcements, each with who it went to and how many opened it.
 */
const PAGE = 20;
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((100 * part) / whole) : 0;

function Slots({ i }: { i: PushInsights }) {
  const max = Math.max(1, ...i.slots.map((s) => s.open_rate ?? 0));
  const any = i.slots.some((s) => s.sends > 0);
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          i.best_slot ? (
            <span className="text-admit font-mono text-[11px]">
              best:{" "}
              {
                i.slots
                  .find((s) => s.key === i.best_slot)
                  ?.label.split(" · ")[0]
              }
            </span>
          ) : null
        }
      >
        When a push lands
      </CardLabel>
      {!any ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">
          Send a few and this says which time of day gets opened.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {i.slots.map((s) => (
            <li key={s.key}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span
                  className={cn(
                    "text-ink",
                    s.key === i.best_slot && "font-medium",
                  )}
                >
                  {s.label}
                </span>
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                  {s.sends
                    ? `${s.open_rate ?? 0}% opened · ${s.sends} ${s.sends === 1 ? "send" : "sends"}`
                    : "—"}
                </span>
              </div>
              <ProgressBar
                value={s.open_rate ?? 0}
                max={max}
                tone={s.key === i.best_slot ? "admit" : "accent"}
                className="mt-1"
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-ink-3 mt-3 text-[11.5px]">
        Open rate by the hour it was sent, in Indian time. A time counts once it
        has two sends.
      </p>
    </FigurePanel>
  );
}

function Reach({ i }: { i: PushInsights }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 font-mono text-[11px]">
            {formatNumber(i.reachable_ahead)} of{" "}
            {formatNumber(i.registered_ahead)} reachable
          </span>
        }
      >
        Who you can reach for what is coming
      </CardLabel>
      {i.coming.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">
          Nothing scheduled. A push goes to the people registered for an event.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {i.coming.map((e) => (
            <li key={e.id}>
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <Link
                  href={`/events/${e.id}`}
                  className="text-ink min-w-0 truncate hover:underline"
                >
                  {e.name}{" "}
                  <span className="text-ink-3">
                    · {e.starts_at ? formatDate(e.starts_at) : ""}
                  </span>
                </Link>
                <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                  {formatNumber(e.reachable)} of {formatNumber(e.registered)}
                </span>
              </div>
              <ProgressBar
                value={e.reachable}
                max={Math.max(1, e.registered)}
                tone={
                  e.registered > 0 && e.reachable / e.registered < 0.5
                    ? "caution"
                    : "accent"
                }
                className="mt-1"
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-ink-3 mt-3 text-[11.5px]">
        Only people signed in to the app on a phone receive a push. The rest see
        it in the app and get the email you send.
      </p>
    </FigurePanel>
  );
}

function Row({ s, now }: { s: PushSend; now: Date }) {
  const live = s.kind === "live_update";
  return (
    <li className="border-line-soft border-t first:border-t-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_150px_110px]">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
            live ? "bg-admit-soft text-admit" : "bg-brand-soft text-brand",
          )}
          title={live ? "Live update" : "Announcement"}
        >
          {live ? (
            <RadioIcon className="size-4" />
          ) : (
            <MegaphoneIcon className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="text-ink block truncate text-[13.5px] font-medium">
            {s.title}
          </span>
          <span className="text-ink-3 block truncate text-[12px]">
            {s.body}
          </span>
        </span>
        <span className="hidden min-w-0 sm:block">
          {s.event ? (
            <Link
              href={`/events/${s.event.id}`}
              className="text-ink-2 block truncate text-[12.5px] hover:underline"
            >
              {s.event.name}
            </Link>
          ) : null}
          {s.audience ? (
            <span className="text-ink-3 block text-[11.5px]">
              {AUDIENCE_LABEL[s.audience] ?? s.audience}
            </span>
          ) : null}
        </span>
        <span className="hidden sm:block">
          <span className="text-ink block font-mono text-[12.5px] tabular-nums">
            {formatNumber(s.read)} of {formatNumber(s.sent)} opened
          </span>
          <ProgressBar
            value={s.read}
            max={Math.max(1, s.sent)}
            tone={s.read_pct >= 50 ? "admit" : "accent"}
            className="mt-1 w-28"
          />
          <span className="text-ink-3 block text-[11px]">
            {s.read_quickly
              ? `${s.read_quickly} within the hour`
              : s.read
                ? "none within the hour"
                : s.sent
                  ? "not opened yet"
                  : "nobody to send to"}
          </span>
        </span>
        <span
          className="text-ink-3 shrink-0 text-right font-mono text-[11px]"
          title={formatDateTime(s.created_at)}
        >
          {relativeTime(s.created_at, now)}
        </span>
      </div>
    </li>
  );
}

export function AnnouncementsPage() {
  const params = useListParams({ pageSize: PAGE });
  const search = useSearchParams();
  const scope: PushScope = (PUSH_SCOPES as readonly string[]).includes(
    search.get("scope") ?? "",
  )
    ? (search.get("scope") as PushScope)
    : "all";
  const [now] = React.useState(() => new Date());
  const insights = usePushInsights();
  const history = usePushHistory({
    scope,
    search: params.search || undefined,
    offset: (params.page - 1) * PAGE,
    limit: PAGE,
  });
  const i = insights.data;
  const rows = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const counts = history.data?.counts ?? {};
  const delta = (d: number | null | undefined) =>
    d
      ? `${d > 0 ? "+" : "−"}${formatNumber(Math.abs(d))} vs prior 30`
      : undefined;
  const trend = (d: number | null | undefined): "up" | "down" | "none" =>
    d ? (d > 0 ? "up" : "down") : "none";
  const lowReach =
    i && i.registered_ahead > 0 && i.reachable_ahead / i.registered_ahead < 0.5;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {i
              ? `${i.sends} ${i.sends === 1 ? "push" : "pushes"} in 30 days · ${formatNumber(i.reached)} phones reached · ${i.open_rate === null || i.open_rate === undefined ? "nothing opened yet" : `${i.open_rate}% opened`}${i.last_sent_at ? ` · last ${relativeTime(i.last_sent_at, now)}` : ""}`
              : "Push notifications to the phones of people registered for an event."}
          </p>
        </div>
        <NewAnnouncementDialog />
      </div>

      {insights.isPending ? (
        <Skeleton className="h-[108px]" />
      ) : i ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Sent, 30 days"
            value={formatNumber(i.sends)}
            note={
              i.sends === 0
                ? "nothing pushed this month"
                : "announcements and live updates"
            }
            delta={delta(i.sends_delta)}
            trend={trend(i.sends_delta)}
          />
          <StatTile
            label="Phones reached"
            value={formatNumber(i.reached)}
            note="people the push landed with"
            delta={delta(i.reached_delta)}
            trend={trend(i.reached_delta)}
          />
          <StatTile
            label="Opened"
            value={
              i.open_rate === null || i.open_rate === undefined
                ? "—"
                : `${i.open_rate}%`
            }
            note={
              i.quick_rate !== null && i.quick_rate !== undefined
                ? `${i.quick_rate}% within the hour`
                : "of the phones reached"
            }
            delta={
              i.open_rate !== null &&
              i.open_rate !== undefined &&
              i.open_rate_prev !== null &&
              i.open_rate_prev !== undefined &&
              i.open_rate !== i.open_rate_prev
                ? `${i.open_rate > i.open_rate_prev ? "+" : "−"}${Math.abs(i.open_rate - i.open_rate_prev)} pts`
                : undefined
            }
            trend={
              i.open_rate !== null &&
              i.open_rate !== undefined &&
              i.open_rate_prev !== null &&
              i.open_rate_prev !== undefined
                ? trend(i.open_rate - i.open_rate_prev)
                : "none"
            }
          />
          <StatTile
            label="Reachable ahead"
            value={
              i.registered_ahead
                ? `${pct(i.reachable_ahead, i.registered_ahead)}%`
                : "—"
            }
            note={
              i.registered_ahead
                ? `${formatNumber(i.reachable_ahead)} of ${formatNumber(i.registered_ahead)} registered have the app`
                : "nothing coming up"
            }
            scale={lowReach ? "hero" : "sm"}
          />
        </div>
      ) : null}

      {lowReach ? (
        <Notice
          tone="caution"
          tag="Reach"
          action={
            <Link href="/emails" className="btn btn-secondary btn-sm">
              Emails
            </Link>
          }
        >
          Fewer than half the people registered for what is coming can be
          reached by push. An email reaches everyone; a push reaches the ones
          with the app.
        </Notice>
      ) : i?.best ? (
        <Notice tone="admit" tag="Most opened">
          “{i.best.title}” — {i.best.read_pct}% of {formatNumber(i.best.sent)}{" "}
          opened it.
        </Notice>
      ) : null}

      {i ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Slots i={i} />
          <Reach i={i} />
        </div>
      ) : null}

      <FigurePanel className="p-0">
        <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Which pushes"
          >
            {PUSH_SCOPES.map((s) => (
              <Chip
                key={s}
                active={scope === s}
                onClick={() =>
                  params.setParam("scope", s === "all" ? undefined : s)
                }
              >
                {PUSH_SCOPE_LABEL[s]}
                {counts[s] ? ` ${counts[s]}` : ""}
              </Chip>
            ))}
          </div>
          <SearchField
            value={params.searchInput}
            onChange={params.setSearchInput}
            onCommit={params.commitSearch}
            placeholder="Title, message or event"
            label="Search announcements"
            className="ml-auto sm:w-64"
          />
        </div>
        {history.isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, k) => (
              <Skeleton key={k} className="h-12" />
            ))}
          </div>
        ) : history.isError ? (
          <EmptyState
            tone="muted"
            title="Could not load what was sent"
            description="Try reloading the page."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            tone="default"
            icon={<SmartphoneIcon />}
            title={
              params.search
                ? "Nothing matches"
                : scope === "live_updates"
                  ? "No live updates yet"
                  : "Nothing pushed yet"
            }
            description={
              params.search
                ? "Try another word."
                : scope === "live_updates"
                  ? "Push one from an event's Live tab on the night."
                  : "An announcement lands on the phones of people registered for an event. Send the first from the button above."
            }
          />
        ) : (
          <ul>
            {rows.map((s) => (
              <Row key={s.id} s={s} now={now} />
            ))}
          </ul>
        )}
        {total > PAGE ? (
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager
              page={params.page}
              pageCount={Math.max(1, Math.ceil(total / PAGE))}
              total={total}
              pageSize={PAGE}
              noun={["push", "pushes"]}
              onPage={params.setPage}
              busy={history.isFetching}
            />
          </div>
        ) : null}
      </FigurePanel>
    </div>
  );
}
