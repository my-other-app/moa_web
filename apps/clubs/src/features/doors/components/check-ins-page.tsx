"use client";

import * as React from "react";
import Link from "next/link";
import {
  DoorOpenIcon,
  DownloadIcon,
  ScanLineIcon,
  Undo2Icon,
} from "lucide-react";
import {
  downloadCsv,
  EVENT_TIMEZONE,
  fetchAllPages,
  formatDateTime,
  formatNumber,
  formatTime,
  minutesBetween,
  pct,
  plural,
  relativeTime,
  timestampedName,
  toCsv,
  type CsvColumn,
  type EventSummary,
} from "@moa/app-kit";
import {
  Button,
  CardLabel,
  cn,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Notice,
  Pager,
  ProgressBar,
  SearchField,
  Segmented,
  Skeleton,
  StatTile,
  toast,
  Toolbar,
  ToolbarEnd,
} from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { useEventSummary } from "@/features/console";

import { fetchCheckInLog } from "../api";
import { useCheckInLog, useUndoCheckIn } from "../queries";
import { VIA_LABEL, type CheckInLog, type CheckInRow } from "../schemas";
import { ArrivalsChart } from "./arrivals-chart";
import { Figure, ROLE, TabHead } from "./parts";

/**
 * Check-ins: who has come, who has not, and how fast the door is moving.
 *
 * Four figures from the live summary — in, still to come, the pace of the
 * last half hour, the last one through — then the arrivals curve beside
 * turnout by role (each with a route to the ones not in yet) and the load
 * on each door. Below, every admission, filterable by door, by how it was
 * made and by who made it, with an export and an undo that asks first.
 */
const ORDER = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
] as const;
const COLS =
  "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_96px_minmax(0,1fr)_88px]";
const QUARTER = 15 * 60_000;

const COLUMNS: CsvColumn<CheckInRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email ?? "" },
  { header: "Ticket", value: (r) => r.ticket_id },
  { header: "Role", value: (r) => ROLE[r.role] ?? r.role },
  { header: "Door", value: (r) => r.door.name },
  { header: "How", value: (r) => VIA_LABEL[r.via] ?? r.via },
  { header: "Checked in", value: (r) => formatDateTime(r.checked_in_at) },
  { header: "Recorded", value: (r) => formatDateTime(r.recorded_at) },
  {
    header: "By",
    value: (r) => r.by.name ?? (r.by.kind === "KIOSK" ? "Self check-in" : ""),
  },
];

/** Admissions since the start of the previous quarter hour: 15 to 30 minutes of the door, as of the summary. */
function paceOf(s: EventSummary) {
  const at = new Date(s.generated_at).getTime();
  const since = Math.floor(at / QUARTER) * QUARTER - QUARTER;
  const n = s.analytics.arrivals
    .filter((b) => new Date(b.starts_at).getTime() >= since)
    .reduce((t, b) => t + b.admits, 0);
  return { n, since: new Date(since).toISOString() };
}

function span(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} min`;

function Figures({ eventId, s }: { eventId: number; s: EventSummary }) {
  const tz = s.timezone || EVENT_TIMEZONE;
  const now = new Date(s.generated_at);
  const t = s.analytics.timing;
  const notIn = Math.max(0, s.registered - s.checked_in);
  const gaps = s.analytics.by_type
    .map((r) => ({ ...r, out: Math.max(0, r.registered - r.checked_in) }))
    .filter((r) => r.out > 0)
    .sort((x, y) => y.out - x.out);
  const pace = paceOf(s);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Checked in"
        value={formatNumber(s.checked_in)}
        note={
          s.registered
            ? `of ${formatNumber(s.registered)} registered · ${pct(s.checked_in, s.registered)}%`
            : "nobody registered yet"
        }
        scale="hero"
      />
      <StatTile
        label="Not in yet"
        value={formatNumber(notIn)}
        note={
          gaps.length
            ? gaps
                .slice(0, 2)
                .map((r) => plural(r.out, r.label.toLowerCase()))
                .join(" · ")
            : s.registered
              ? "everyone is in"
              : "the guest list is empty"
        }
        action={
          notIn > 0
            ? { label: "See who", href: `/events/${eventId}/attendees?in=no` }
            : undefined
        }
        linkAs={Link}
      />
      <StatTile
        label="Pace"
        value={formatNumber(pace.n)}
        note={`admitted since ${formatTime(pace.since, tz)}${t.peak_admits ? ` · busiest 15 min: ${t.peak_admits}` : ""}`}
      />
      <StatTile
        label="Last through"
        value={t.last_admit_at ? formatTime(t.last_admit_at, tz) : "—"}
        note={
          t.last_admit_at
            ? `${relativeTime(t.last_admit_at, now)}${t.first_admit_at ? ` · first at ${formatTime(t.first_admit_at, tz)}` : ""}`
            : "the first scan shows here"
        }
      />
    </div>
  );
}

function Arrivals({ s }: { s: EventSummary }) {
  const a = s.analytics;
  const t = a.timing;
  const tz = s.timezone || EVENT_TIMEZONE;
  const nobody = a.total_admitted === 0 || a.arrivals.length === 0;
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          nobody ? null : (
            <span className="text-ink-3 flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className="bg-brand-line inline-block h-2 w-3 rounded-[2px]"
                />
                per 15 min
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className="bg-admit inline-block h-[2px] w-3 rounded-full"
                />
                in the house
              </span>
            </span>
          )
        }
      >
        Arrivals
      </CardLabel>
      {nobody ? (
        <p className="text-ink-3 py-10 text-center text-[12.5px]">
          The curve draws itself from the first admission.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <ArrivalsChart a={a} startsAt={s.starts_at} timezone={tz} />
          </div>
          <div className="border-line-soft mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
            <Figure
              k="First through"
              v={t.first_admit_at ? formatTime(t.first_admit_at, tz) : "—"}
              sub={
                t.first_admit_at
                  ? `${signed(minutesBetween(s.starts_at, t.first_admit_at))} from the start`
                  : undefined
              }
            />
            <Figure
              k="Busiest 15 min"
              v={t.peak_starts_at ? formatTime(t.peak_starts_at, tz) : "—"}
              sub={
                t.peak_starts_at ? plural(t.peak_admits, "admission") : undefined
              }
            />
            <Figure
              k="Half in by"
              v={t.half_house_at ? formatTime(t.half_house_at, tz) : "—"}
              sub={
                t.half_house_minutes !== null
                  ? `${signed(t.half_house_minutes)} from the start`
                  : "not yet"
              }
            />
            <Figure
              k="Door busy for"
              v={
                t.first_admit_at && t.last_admit_at
                  ? span(minutesBetween(t.first_admit_at, t.last_admit_at))
                  : "—"
              }
              sub="first to last through"
            />
          </div>
        </>
      )}
    </FigurePanel>
  );
}

function Turnout({ eventId, s }: { eventId: number; s: EventSummary }) {
  const rows = s.analytics.by_type.filter(
    (r) => r.registered > 0 || r.checked_in > 0,
  );
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          s.registered ? (
            <span className="text-ink-3 font-mono text-[11px]">
              {pct(s.checked_in, s.registered)}% in
            </span>
          ) : null
        }
      >
        Turnout by role
      </CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">
          Nobody is on the guest list yet.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {rows.map((r) => {
            const out = Math.max(0, r.registered - r.checked_in);
            return (
              <li key={r.role}>
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-ink truncate">{r.label}</span>
                  <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                    {formatNumber(r.checked_in)} of {formatNumber(r.registered)}{" "}
                    · {pct(r.checked_in, r.registered)}%
                  </span>
                </div>
                <ProgressBar
                  value={r.checked_in}
                  max={Math.max(1, r.registered)}
                  tone="admit"
                  className="mt-1"
                  label={`${r.label} checked in`}
                />
                {out > 0 ? (
                  <Link
                    href={`/events/${eventId}/attendees?in=no&role=${encodeURIComponent(r.role)}`}
                    className="text-ink-3 hover:text-brand mt-1 inline-block text-[11.5px]"
                  >
                    {formatNumber(out)} not in yet →
                  </Link>
                ) : (
                  <span className="text-admit mt-1 inline-block text-[11.5px]">
                    Everyone is in
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </FigurePanel>
  );
}

function DoorLoad({ s }: { s: EventSummary }) {
  const a = s.analytics;
  const tz = s.timezone || EVENT_TIMEZONE;
  const now = new Date(s.generated_at);
  return (
    <FigurePanel className="p-4">
      <CardLabel>By door</CardLabel>
      <ul className="mt-3 grid gap-3">
        {a.by_door.map((d) => (
          <li key={d.door_id ?? d.name}>
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="text-ink truncate">{d.name}</span>
              <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                {formatNumber(d.admits)} · {Math.round(d.share_pct)}%
              </span>
            </div>
            <ProgressBar
              value={d.admits}
              max={Math.max(1, a.total_admitted)}
              className="mt-1"
              label={`${d.name} admitted`}
            />
            <span className="text-ink-3 mt-1 block text-[11.5px]">
              {d.last_admit_at
                ? `last ${formatTime(d.last_admit_at, tz)}, ${relativeTime(d.last_admit_at, now)}`
                : "nobody yet"}
              {d.peak_admits ? ` · peak ${d.peak_admits} in 15 min` : ""}
            </span>
          </li>
        ))}
      </ul>
    </FigurePanel>
  );
}

function LogRow({
  r,
  tz,
  withDate,
  now,
  confirming,
  busy,
  onAsk,
  onUndo,
}: {
  r: CheckInRow;
  tz: string;
  withDate: boolean;
  now: Date;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onUndo: () => void;
}) {
  const when = withDate
    ? formatDateTime(r.checked_in_at)
    : formatTime(r.checked_in_at, tz);
  const by = r.by.name ?? (r.by.kind === "KIOSK" ? "Self check-in" : "—");
  return (
    <li
      className={cn(
        "border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2.5 text-[12.5px]",
        COLS,
      )}
    >
      <span className="min-w-0">
        <span className="text-ink block truncate text-[13.5px] font-medium">
          {r.name}
        </span>
        <span className="text-ink-3 block truncate font-mono text-[11px]">
          {r.ticket_id} · {ROLE[r.role] ?? r.role}
          <span className="sm:hidden">
            {" "}
            · {r.door.name} · {when}
          </span>
        </span>
      </span>
      <span className="text-ink-2 hidden truncate sm:block">{r.door.name}</span>
      <span className="text-ink-2 hidden truncate sm:block">
        {VIA_LABEL[r.via] ?? r.via}
      </span>
      <span
        className="hidden font-mono tabular-nums sm:block"
        title={formatDateTime(r.checked_in_at)}
      >
        <span className="text-ink block">{when}</span>
        <span className="text-ink-3 block text-[11px]">
          {r.via === "offline_sync"
            ? `synced ${formatTime(r.recorded_at, tz)}`
            : relativeTime(r.checked_in_at, now)}
        </span>
      </span>
      <span className="text-ink-2 hidden truncate sm:block">{by}</span>
      <span className="flex justify-end">
        {confirming ? (
          <Button
            variant="secondary"
            size="sm"
            round
            danger
            disabled={busy}
            aria-label={`Confirm undoing the check-in for ${r.name}`}
            onClick={onUndo}
          >
            Undo?
          </Button>
        ) : (
          <IconButton
            label={`Undo check-in for ${r.name}`}
            disabled={busy}
            onClick={onAsk}
          >
            <Undo2Icon />
          </IconButton>
        )}
      </span>
    </li>
  );
}

type Filters = {
  q: string;
  setQ: (v: string) => void;
  doorId: string | undefined;
  setDoorId: (v: string | undefined) => void;
  via: string | undefined;
  setVia: (v: string | undefined) => void;
  by: number | undefined;
  setBy: (v: number | undefined) => void;
  order: "newest" | "oldest";
  setOrder: (v: "newest" | "oldest") => void;
  page: number;
  setPage: (v: number) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  clear: () => void;
  filtered: boolean;
};

function Log({
  eventId,
  tz,
  doorOpen,
  log,
  filters,
}: {
  eventId: number;
  tz: string;
  doorOpen: boolean | undefined;
  log: ReturnType<typeof useCheckInLog>;
  filters: Filters;
}) {
  const undo = useUndoCheckIn(eventId);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const f: CheckInLog["facets"] | undefined = log.data?.facets;
  const total = log.data?.total ?? 0;
  const now = new Date(log.dataUpdatedAt || 0);
  const withDate =
    !!f?.first_at &&
    !!f.last_at &&
    f.first_at.slice(0, 10) !== f.last_at.slice(0, 10);
  const doors =
    f?.doors.filter((d): d is typeof d & { id: string } => d.id !== null) ?? [];

  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <CardLabel>Every admission</CardLabel>
        <span className="text-ink-3 text-[11.5px]">
          Refreshes every 15 seconds
        </span>
      </div>
      <Toolbar className="mt-1">
        <NativeSelect
          aria-label="Door"
          value={filters.doorId ?? ""}
          onChange={(e) => filters.setDoorId(e.target.value || undefined)}
          className="w-auto"
          disabled={!f}
        >
          <option value="">Every door</option>
          {doors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.count}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="How they got in"
          value={filters.via ?? ""}
          onChange={(e) => filters.setVia(e.target.value || undefined)}
          className="w-auto"
          disabled={!f}
        >
          <option value="">Every way in</option>
          {f?.methods.map((m) => (
            <option key={m.via} value={m.via}>
              {VIA_LABEL[m.via] ?? m.via} · {m.count}
            </option>
          ))}
        </NativeSelect>
        {f?.staff.length ? (
          <NativeSelect
            aria-label="Admitted by"
            value={filters.by ?? ""}
            onChange={(e) =>
              filters.setBy(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-auto"
          >
            <option value="">Anyone</option>
            {f.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? "—"} · {s.count}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <ToolbarEnd>
          <SearchField
            value={filters.q}
            onChange={filters.setQ}
            placeholder="Name, email or ticket"
            label="Search the check-ins"
            className="sm:w-56"
          />
          <Segmented
            label="Order"
            value={filters.order}
            options={ORDER}
            onChange={filters.setOrder}
          />
        </ToolbarEnd>
      </Toolbar>

      {log.isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : log.isError ? (
        <EmptyState
          title="Could not load the check-ins"
          description="Check the connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void log.refetch()}>
              Try again
            </Button>
          }
        />
      ) : log.data.items.length === 0 ? (
        filters.filtered ? (
          <EmptyState
            size="sm"
            title="Nobody matches"
            description="No admission matches these filters."
            action={
              <Button variant="secondary" size="sm" onClick={filters.clear}>
                Clear the filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ScanLineIcon />}
            title="Nobody checked in yet"
            description={
              doorOpen === false
                ? "The door is shut, so the gate refuses scans for now. Each admission will land here with its door, how it was made and who made it."
                : "Open the gate on a phone and scan the first ticket. Each admission lands here with its door, how it was made and who made it."
            }
            action={
              <Link
                href={`/events/${eventId}/team`}
                className="btn btn-secondary"
              >
                Set up the doors
              </Link>
            }
          />
        )
      ) : (
        <>
          <div
            className={cn(
              "hidden gap-3 px-4 py-2 sm:grid",
              COLS,
            )}
          >
            <span className="eyebrow">Guest</span>
            <span className="eyebrow">Door</span>
            <span className="eyebrow">How</span>
            <span className="eyebrow">When</span>
            <span className="eyebrow">By</span>
            <span />
          </div>
          <ul>
            {log.data.items.map((r) => (
              <LogRow
                key={r.id}
                r={r}
                tz={tz}
                withDate={withDate}
                now={now}
                confirming={confirming === r.id}
                busy={undo.isPending}
                onAsk={() => setConfirming(r.id)}
                onUndo={() => {
                  undo.mutate(r.registration_id);
                  setConfirming(null);
                }}
              />
            ))}
          </ul>
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager
              page={filters.page}
              pageCount={Math.max(1, Math.ceil(total / filters.pageSize))}
              total={total}
              pageSize={filters.pageSize}
              noun={["admission", "admissions"]}
              busy={log.isFetching}
              onPage={filters.setPage}
              onPageSize={filters.setPageSize}
            />
          </div>
        </>
      )}
    </FigurePanel>
  );
}

/** The door, in figures and row by row: who came in, where, how, by whom, and how fast. */
export function CheckInsPage({ eventId }: { eventId: number }) {
  const summary = useEventSummary(eventId);
  const [q, setQ] = React.useState("");
  const settled = useDebouncedValue(q.trim(), 300);
  const [doorId, setDoorId] = React.useState<string | undefined>(undefined);
  const [via, setVia] = React.useState<string | undefined>(undefined);
  const [by, setBy] = React.useState<number | undefined>(undefined);
  const [order, setOrder] = React.useState<"newest" | "oldest">("newest");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [exporting, setExporting] = React.useState(false);
  const query = { eventId, q: settled || undefined, doorId, via, by, order };
  const log = useCheckInLog({ ...query, page, pageSize });
  const s = summary.data;
  const f = log.data?.facets;
  const tz = s?.timezone || EVENT_TIMEZONE;
  const now = s ? new Date(s.generated_at) : null;
  const last = s?.analytics.timing.last_admit_at ?? f?.last_at ?? null;
  const shut =
    !!s &&
    !s.door_open &&
    (s.status === "published" || s.status === "live") &&
    new Date(s.generated_at) < new Date(s.ends_at);

  const filters: Filters = {
    q,
    setQ: (v) => (setQ(v), setPage(1)),
    doorId,
    setDoorId: (v) => (setDoorId(v), setPage(1)),
    via,
    setVia: (v) => (setVia(v), setPage(1)),
    by,
    setBy: (v) => (setBy(v), setPage(1)),
    order,
    setOrder: (v) => (setOrder(v), setPage(1)),
    page,
    setPage,
    pageSize,
    setPageSize: (n) => (setPageSize(n), setPage(1)),
    clear: () => {
      setQ("");
      setDoorId(undefined);
      setVia(undefined);
      setBy(undefined);
      setPage(1);
    },
    filtered: !!(q.trim() || doorId || via || by !== undefined),
  };

  const exportLog = async () => {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages<CheckInRow>(
        async (offset, limit) => {
          const res = await fetchCheckInLog({
            ...query,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
          });
          return { items: res.items, total: res.total };
        },
      );
      downloadCsv(
        timestampedName(`check-ins-${eventId}`),
        toCsv(rows, COLUMNS),
      );
      if (truncated)
        toast.warning(
          `The first ${formatNumber(rows.length)} admissions were exported`,
          { description: "Narrow the filters to export the rest." },
        );
      else toast.success(`${plural(rows.length, "admission")} exported`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not export the check-ins",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-5">
      <TabHead
        title="Check-ins"
        line={
          s
            ? `${formatNumber(s.checked_in)} of ${formatNumber(s.registered)} checked in · ${pct(s.checked_in, s.registered)}% · door ${s.door_open ? "open" : "shut"}${last && now ? ` · last through ${relativeTime(last, now)}` : ""}`
            : "Every admission: where, how and by whom."
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void exportLog()}
              disabled={exporting || !f?.total}
            >
              <DownloadIcon /> {exporting ? "Exporting…" : "Export"}
            </Button>
            <Link
              href={`/gate/${eventId}`}
              target="_blank"
              rel="noopener"
              className="btn btn-secondary"
            >
              <DoorOpenIcon /> Open the gate
            </Link>
          </>
        }
      />

      {summary.isError ? (
        <Notice tone="neutral" tag="Figures">
          The door&apos;s figures could not load. The log below still works;
          reload the page to try the figures again.
        </Notice>
      ) : !s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-[280px] rounded-2xl" />
            <Skeleton className="h-[280px] rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <Figures eventId={eventId} s={s} />
          {shut ? (
            <Notice
              tone="caution"
              tag="Door shut"
              action={
                <Link
                  href={`/events/${eventId}/team`}
                  className="btn btn-secondary btn-sm"
                >
                  Door settings
                </Link>
              }
            >
              The door is shut, so the gate refuses every scan, even a valid
              ticket. When it opens is set under Doors.
            </Notice>
          ) : null}
          <div className="grid items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Arrivals s={s} />
            <div className="grid gap-3">
              <Turnout eventId={eventId} s={s} />
              {s.analytics.by_door.length > 1 ? <DoorLoad s={s} /> : null}
            </div>
          </div>
        </>
      )}

      <Log
        eventId={eventId}
        tz={tz}
        doorOpen={s?.door_open}
        log={log}
        filters={filters}
      />
    </div>
  );
}
