"use client";

import * as React from "react";
import Link from "next/link";
import { IdCardIcon, PaletteIcon, PrinterIcon } from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import {
  CardLabel,
  Checkbox,
  Chip,
  ChoiceCard,
  EmptyState,
  FigurePanel,
  Notice,
  Pager,
  ProgressBar,
  Segmented,
  Skeleton,
  StatTile,
  StatusBadge,
  Switch,
  Toolbar,
  ToolbarEnd,
  cn,
} from "@moa/ui";

import { AdmissionPanel } from "@/features/admission";

import { batchPdfUrl } from "../api";
import {
  useCardSummary,
  usePrintJobs,
  useRefreshCards,
  useUpdateCardSettings,
} from "../queries";
import {
  SOURCE_LABEL,
  type CardSummary,
  type PrintJob,
  type ReprintPolicy,
} from "../schemas";
import { openPdf } from "./print-frame";

/**
 * ID cards, rebuilt around the question at the desk before doors open:
 * how many guests have a card, and how do I print the rest. One line and
 * four figures; what needs a look said once; then the batch — the rest,
 * everyone, or one role at a time, each with how far along it is — beside
 * the rules that decide who may print a second card and what the blank
 * stock already carries. Admission numbers, which every card prints, sit
 * under them, and every card put out is the log at the foot.
 */
const ROLE: Record<string, string> = {
  attendee: "Attendees",
  speaker: "Speakers",
  staff: "Staff",
};
const roleLabel = (r: string) =>
  ROLE[r] ?? r.charAt(0).toUpperCase() + r.slice(1);
const plural = (n: number, one: string, many = `${one}s`) =>
  n === 1 ? one : many;
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((100 * part) / whole) : 0;

type Scope = "all" | "not_printed";
type Print = (scope: Scope, role?: string) => void;

// ─── Print a batch ───────────────────────────────────────────────────────

function BatchRow({
  label,
  sub,
  count,
  printed,
  verb,
  onPrint,
}: {
  label: string;
  sub?: string;
  count: number;
  printed: number | null;
  verb: string;
  onPrint: () => void;
}) {
  return (
    <li className="border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="text-ink truncate text-[13.5px] font-medium">
            {label}
          </span>
          {printed !== null ? (
            <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
              {formatNumber(printed)} of {formatNumber(count)} printed
            </span>
          ) : null}
        </div>
        {printed !== null ? (
          <ProgressBar
            value={printed}
            max={count}
            tone={count > 0 && printed >= count ? "admit" : "accent"}
            height={6}
            className="mt-1.5"
            label={`${label}: ${printed} of ${count} printed`}
          />
        ) : sub ? (
          <p className="text-ink-3 mt-0.5 text-[12px]">{sub}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={count === 0}
        onClick={onPrint}
        aria-label={`${verb} ${formatNumber(count)}: ${label.toLowerCase()}`}
      >
        <PrinterIcon /> {verb} {formatNumber(count)}
      </button>
    </li>
  );
}

function BatchPanel({
  s,
  record,
  onRecord,
  onPrint,
}: {
  s: CardSummary;
  record: boolean;
  onRecord: (on: boolean) => void;
  onPrint: Print;
}) {
  const todo = Math.max(0, s.registered - s.printed);
  const verb = record ? "Print" : "Preview";
  return (
    <FigurePanel className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <CardLabel>Print a batch</CardLabel>
        <Segmented
          label="What printing does"
          value={record ? "record" : "preview"}
          options={[
            { value: "record", label: "Mark as printed" },
            { value: "preview", label: "Preview only" },
          ]}
          onChange={(v) => onRecord(v === "record")}
        />
      </div>
      <p className="text-ink-3 px-4 pt-2 pb-3 text-[12.5px] leading-[1.5]">
        One PDF, a card a page at the card&apos;s own size — for a card
        printer on the desk machine, or a print shop.{" "}
        {record
          ? "Each card in it is marked printed, which the reprint rule and “still to print” read."
          : "Nothing is marked printed: open it to check the cards before the real run."}
      </p>
      <ul>
        <BatchRow
          label="Not yet printed"
          sub="Everyone with a ticket and no card so far."
          count={todo}
          printed={null}
          verb={verb}
          onPrint={() => onPrint("not_printed")}
        />
        <BatchRow
          label="Everyone"
          count={s.registered}
          printed={s.printed}
          verb={verb}
          onPrint={() => onPrint("all")}
        />
        {s.by_role.map((r) => (
          <BatchRow
            key={r.role}
            label={roleLabel(r.role)}
            count={r.registered}
            printed={r.printed}
            verb={verb}
            onPrint={() => onPrint("all", r.role)}
          />
        ))}
      </ul>
    </FigurePanel>
  );
}

// ─── The rules ───────────────────────────────────────────────────────────

function RulesPanel({ eventId, s }: { eventId: number; s: CardSummary }) {
  const update = useUpdateCardSettings(eventId);
  const carries = s.settings.preprinted_carries;
  return (
    <FigurePanel className="p-4">
      <CardLabel>Who may print a second card</CardLabel>
      <div
        className="mt-3 grid gap-2"
        role="radiogroup"
        aria-label="Reprint policy"
      >
        {s.reprint_policies.map((p) => (
          <ChoiceCard
            key={p.key}
            checked={s.settings.reprint_policy === p.key}
            onClick={() =>
              update.mutate({ reprint_policy: p.key as ReprintPolicy })
            }
            title={p.label}
            hint={p.note}
            disabled={update.isPending}
          />
        ))}
      </div>

      <div className="border-line-soft mt-4 flex items-start justify-between gap-3 border-t pt-4">
        <span className="min-w-0">
          <span className="text-ink block text-[13px] font-medium">
            Print the card at check-in
          </span>
          <span className="text-ink-3 block text-[12px] leading-[1.5]">
            The gate opens the print dialog on a guest&apos;s first admission.
            A second scan never prints.
          </span>
        </span>
        <Switch
          checked={s.settings.auto_print_badges}
          onCheckedChange={(on) => update.mutate({ auto_print_badges: on })}
          disabled={update.isPending}
          aria-label="Print the card when a guest is checked in"
          className="mt-0.5"
        />
      </div>

      {s.preprinted_layers.length ? (
        <div className="border-line-soft mt-4 border-t pt-4">
          <CardLabel>Already on the blank cards</CardLabel>
          <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
            Tick what the stock you bought already carries; those parts are
            left out at print time so nothing prints twice. Layers marked
            pre-printed in the designer are left out too.
          </p>
          <ul className="mt-2 grid gap-1">
            {s.preprinted_layers.map((l) => {
              const on = carries.includes(l.key);
              const id = `preprinted-${l.key}`;
              return (
                <li
                  key={l.key}
                  className="hover:bg-sunken flex items-start gap-2.5 rounded-[var(--radius-field)] px-2 py-2"
                >
                  <Checkbox
                    id={id}
                    checked={on}
                    disabled={update.isPending}
                    onCheckedChange={(v) =>
                      update.mutate({
                        preprinted_carries:
                          v === true
                            ? [...carries, l.key]
                            : carries.filter((k) => k !== l.key),
                      })
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <span className="text-ink block text-[13px]">
                      {l.label}
                    </span>
                    <span className="text-ink-3 block text-[12px]">
                      {l.note}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </FigurePanel>
  );
}

// ─── Every card put out ──────────────────────────────────────────────────

const JOB_COLS =
  "sm:grid-cols-[132px_minmax(0,1.6fr)_104px_minmax(0,1fr)_56px]";

function JobRow({ j, current }: { j: PrintJob; current: number }) {
  const how = SOURCE_LABEL[j.source] ?? j.source;
  const older = current > 0 && j.design_version < current;
  return (
    <li
      className={cn(
        "border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2.5 text-[12.5px]",
        JOB_COLS,
      )}
    >
      <span className="text-ink-3 hidden font-mono text-[11.5px] tabular-nums sm:block">
        {formatDateTime(j.created_at)}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink truncate font-medium">
            {j.guest ?? `${formatNumber(j.cards)} ${plural(j.cards, "card")}`}
          </span>
          {j.overrode ? (
            <StatusBadge tone="warning" label="Rule overridden" />
          ) : null}
        </span>
        <span className="text-ink-3 block truncate text-[11.5px] sm:hidden">
          {formatDateTime(j.created_at)} · {how}
          {j.door ? ` · ${j.door}` : ""}
        </span>
        {j.error ? (
          <span className="text-refuse block text-[11.5px]">
            Did not print: {j.error}
          </span>
        ) : null}
      </span>
      <span className="text-ink-2 hidden sm:block">{how}</span>
      <span className="text-ink-2 hidden truncate sm:block">
        {j.door ?? <span className="text-ink-3">—</span>}
      </span>
      <span
        className={cn(
          "text-right font-mono text-[11px] tabular-nums",
          older ? "text-caution" : "text-ink-3",
        )}
        title={older ? "Printed on an older design" : undefined}
      >
        v{j.design_version}
      </span>
    </li>
  );
}

function JobsPanel({
  eventId,
  current,
}: {
  eventId: number;
  current: number;
}) {
  const jobs = usePrintJobs(eventId);
  const [source, setSource] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const all = jobs.data ?? [];
  const sources = Object.keys(SOURCE_LABEL).filter((k) =>
    all.some((j) => j.source === k),
  );
  const rows = source === "all" ? all : all.filter((j) => j.source === source);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const cards = all.reduce((n, j) => n + (j.error ? 0 : j.cards), 0);
  const pick = (k: string) => {
    setSource(k);
    setPage(1);
  };

  return (
    <FigurePanel className="overflow-hidden p-0">
      <Toolbar>
        <CardLabel className="mr-1">Cards put out</CardLabel>
        {all.length ? (
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="How the cards were printed"
          >
            <Chip active={source === "all"} onClick={() => pick("all")}>
              All {all.length}
            </Chip>
            {sources.map((k) => (
              <Chip key={k} active={source === k} onClick={() => pick(k)}>
                {SOURCE_LABEL[k]} {all.filter((j) => j.source === k).length}
              </Chip>
            ))}
          </div>
        ) : null}
        {all.length ? (
          <ToolbarEnd>
            <span className="text-ink-3 text-[11.5px]">
              {formatNumber(cards)} {plural(cards, "card")} · newest first
            </span>
          </ToolbarEnd>
        ) : null}
      </Toolbar>
      {jobs.isPending ? (
        <Skeleton className="m-4 h-24 rounded-xl" />
      ) : jobs.isError ? (
        <EmptyState
          size="sm"
          title="Could not load the print log"
          description="The figures above are still right. Reload to try again."
        />
      ) : all.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<IdCardIcon />}
          title="No card printed yet"
          description="The first comes from a check-in at the gate, the attendees page, or a batch above."
        />
      ) : (
        <>
          <div
            className={cn(
              "text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid",
              JOB_COLS,
            )}
          >
            <span>When</span>
            <span>What</span>
            <span>How</span>
            <span>Where</span>
            <span className="text-right">Design</span>
          </div>
          <ul>
            {shown.map((j) => (
              <JobRow key={j.id} j={j} current={current} />
            ))}
          </ul>
          {rows.length > pageSize ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager
                page={page}
                pageCount={pageCount}
                total={rows.length}
                pageSize={pageSize}
                noun={["print run", "print runs"]}
                onPage={setPage}
              />
            </div>
          ) : null}
        </>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

function Attention({ s, designHref }: { s: CardSummary; designHref: string }) {
  if (s.registered === 0)
    return (
      <Notice tone="neutral" tag="Nobody yet">
        Nobody has a ticket yet, so there is nothing to print. Cards follow
        registrations.
      </Notice>
    );
  if (!s.design_version)
    return (
      <Notice
        tone="caution"
        tag="Design"
        action={
          <Link href={designHref} className="btn btn-secondary btn-sm">
            Open the designer
          </Link>
        }
      >
        Cards print on the starter design until you make your own: the
        club&apos;s look, the right size for your stock, the fields guests
        wear.
      </Notice>
    );
  if (s.settings.auto_print_badges)
    return (
      <Notice tone="accent" tag="At the gate">
        Each guest&apos;s card prints at the gate on their first check-in, so
        a batch is only needed for the ones you want ready beforehand.
      </Notice>
    );
  return null;
}

/** ID cards: how many are out, printing the rest, the rules, and every card put out. */
export function IdCardsPage({ eventId }: { eventId: number }) {
  const summary = useCardSummary(eventId);
  const refresh = useRefreshCards(eventId);
  const [record, setRecord] = React.useState(true);
  const s = summary.data;
  const todo = s ? Math.max(0, s.registered - s.printed) : 0;
  const designHref = `/events/${eventId}/design?kind=badge`;
  const print: Print = (scope, role) => {
    openPdf(batchPdfUrl(eventId, { scope, role, record }));
    // The batch marks cards as printed on the server; the numbers follow once the tab has fetched it.
    if (record) setTimeout(refresh, 2500);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            ID cards
          </h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {s
              ? `${formatNumber(s.printed)} of ${formatNumber(s.registered)} printed · ${s.design_version ? `design v${s.design_version}` : "starter design"} · ${formatNumber(s.jobs)} ${plural(s.jobs, "print run")}`
              : "The card or label each guest wears, drawn from the design at print time."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={designHref} className="btn btn-secondary">
            <PaletteIcon /> Card design
          </Link>
          {s && todo > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => print("not_printed")}
            >
              <PrinterIcon /> {record ? "Print" : "Preview"}{" "}
              {formatNumber(todo)} not yet printed
            </button>
          ) : null}
        </div>
      </header>

      {summary.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the cards"
          description={summary.error?.message ?? "Try again in a moment."}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void summary.refetch()}
            >
              Try again
            </button>
          }
        />
      ) : !s ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[120px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
            <Skeleton className="h-[260px] rounded-2xl" />
            <Skeleton className="h-[260px] rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Printed"
              value={formatNumber(s.printed)}
              note={`of ${formatNumber(s.registered)} with a ticket · ${pct(s.printed, s.registered)}%`}
              scale="hero"
            />
            <StatTile
              label="Still to print"
              value={formatNumber(todo)}
              note={
                todo
                  ? "no card put out so far"
                  : s.registered
                    ? "everyone with a ticket has a card"
                    : "nobody registered yet"
              }
            />
            <StatTile
              label="Design"
              value={s.design_version ? `v${s.design_version}` : "Starter"}
              note="cards are drawn from it at print time"
              action={{ label: "Open the designer", href: designHref }}
              linkAs={Link}
            />
            <StatTile
              label="Print runs"
              value={formatNumber(s.jobs)}
              note="single cards and batches recorded"
            />
          </div>

          <Attention s={s} designHref={designHref} />

          <div className="grid items-start gap-3.5 lg:grid-cols-[1.5fr_1fr]">
            <BatchPanel
              s={s}
              record={record}
              onRecord={setRecord}
              onPrint={print}
            />
            <RulesPanel eventId={eventId} s={s} />
          </div>

          <AdmissionPanel eventId={eventId} />

          <JobsPanel eventId={eventId} current={s.design_version} />
        </>
      )}
    </div>
  );
}
