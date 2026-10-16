"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, PencilIcon, PlusIcon, ReceiptIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import { CardLabel, Chip, DefinitionRows, EmptyState, FigurePanel, Notice, Pager, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { statementUrl } from "../api";
import { useDeleteExpense, useFinance } from "../queries";
import { EVENT_FILTERS, EVENT_FILTER_LABEL, PERIODS, categoryLabel, monthLabel, periodLabel, periodRange, type EntryKind, type EventFilter, type EventRow, type Expense, type FinanceScope, type FinanceSummary, type PeriodKey } from "../schemas";
import { ExpenseDialog } from "./expense-dialog";
import { plural, rupees, short } from "./money";

export { rupees, short } from "./money";

/**
 * Finance, rebuilt around the one question a treasurer has: did we come
 * out ahead, and where did the money go. One line and four figures on
 * the period — net, in, out, owed; money in and out month by month; where
 * it went by category and where it came from by channel; what each event
 * type and each event made; then the ledger. What needs a look — an event
 * that ran at a loss, money owed at an event already held, a held paid
 * event with nothing logged — is said once, above the figures.
 */
function delta(value: number | null | undefined, unit = "%"): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null || value === undefined || value === 0) return { trend: "none" };
  return { delta: `${value > 0 ? "+" : "−"}${Math.abs(value)}${unit} vs prior`, trend: value > 0 ? "up" : "down" };
}
/** Spending that grew is not good news, so its arrow stays neutral. */
const flat = (value: number | null | undefined) => ({ ...delta(value), trend: "none" as const });

const BRAND = "var(--brand, #17a58f)";
const SPEND = "#f59e0b";
const INK = "var(--muted-foreground, #979797)";
const LINE = "var(--border, #3d454f)";
const MONO = "var(--font-plex-mono), ui-monospace, monospace";

// ─── Money in and out, by month ──────────────────────────────────────────

function InOut({ s }: { s: FinanceSummary }) {
  const rows = s.by_month;
  const W = 640;
  const H = 230;
  const PAD = { l: 8, r: 8, t: 22, b: 22 };
  const mid = PAD.t + (H - PAD.t - PAD.b) / 2;
  const half = (H - PAD.t - PAD.b) / 2 - 14;
  const slot = (W - PAD.l - PAD.r) / Math.max(1, rows.length);
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.tickets + r.merch + r.other, r.expenses)));
  const bw = Math.min(34, slot * 0.42);
  const spansYears = rows.length > 1 && rows[0]!.month.slice(0, 4) !== rows.at(-1)!.month.slice(0, 4);
  const empty = rows.every((r) => r.tickets + r.merch + r.other === 0 && r.expenses === 0);
  const best = rows.reduce<FinanceSummary["by_month"][number] | null>((a, b) => (a === null || b.net > a.net ? b : a), null);

  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: BRAND }} /> In
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: SPEND }} /> Out
            </span>
          </span>
        }
      >
        Money in and out, by month
      </CardLabel>
      {empty ? (
        <p className="text-ink-3 mt-3 py-8 text-center text-[12.5px]">{s.scope === "club" ? "Nothing came in or went out in this period. Paid events and logged expenses fill this in." : "Nothing has moved for this event yet."}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money in and out by month" className="mt-3 h-auto w-full">
            <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} stroke={LINE} />
            {rows.map((r, i) => {
              const cx = PAD.l + slot * i + slot / 2;
              const inn = r.tickets + r.merch + r.other;
              const up = (inn / peak) * half;
              const down = (r.expenses / peak) * half;
              const labelY = inn > 0 || r.expenses === 0 ? mid - up - 6 : mid + down + 13;
              return (
                <g key={r.month}>
                  <title>{`${monthLabel(r.month)}: ${rupees(inn)} in${r.other ? ` (${rupees(r.other)} besides tickets)` : ""}, ${rupees(r.expenses)} out${r.refunds ? `, ${rupees(r.refunds)} refunded` : ""} · net ${rupees(r.net)}`}</title>
                  {inn > 0 ? <rect x={cx - bw / 2} y={mid - up} width={bw} height={up} rx={3} fill={BRAND} /> : null}
                  {r.expenses > 0 ? <rect x={cx - bw / 2} y={mid} width={bw} height={down} rx={3} fill={SPEND} opacity={0.9} /> : null}
                  {inn > 0 || r.expenses > 0 ? (
                    <text x={cx} y={labelY} textAnchor="middle" fontSize={11} fill={r.net < 0 ? "#ef4444" : INK} fontFamily={MONO}>
                      {short(r.net)}
                    </text>
                  ) : null}
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={INK}>
                    {monthLabel(r.month)}
                    {spansYears ? ` ’${r.month.slice(2, 4)}` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="text-ink-3 mt-1 text-[11.5px]">
            {s.scope === "club" ? "Each event's money sits in the month it was held; an overhead in the month it was paid." : "By the month the money moved."} The figure on each month is its net.
            {best && best.net > 0 ? ` Best month: ${monthLabel(best.month)}, ${rupees(best.net)}.` : ""}
          </p>
        </>
      )}
    </FigurePanel>
  );
}

// ─── Where it went · where it came from ──────────────────────────────────

function WhereItWent({ s }: { s: FinanceSummary }) {
  const rows = s.by_category;
  const total = Math.max(1, s.figures.expenses);
  return (
    <FigurePanel className="p-4">
      <CardLabel right={rows.length ? <span className="text-ink-3 font-mono text-[11px]">{rupees(s.figures.expenses)}</span> : null}>Where it went</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Nothing logged yet. Each expense you log lands in its category here.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <li key={r.category}>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className={cn("text-ink truncate", i === 0 && "font-medium")}>
                  {categoryLabel(r.category)} <span className="text-ink-3">· {r.count}</span>
                </span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                  {rupees(r.amount)} · {Math.round((100 * r.amount) / total)}%
                </span>
              </div>
              <ProgressBar value={r.amount} max={total} tone="caution" className="mt-1" label={`${categoryLabel(r.category)} spend`} />
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

function WhereItCameFrom({ s }: { s: FinanceSummary }) {
  const f = s.figures;
  const rows = s.channels.filter((c) => c.amount > 0 || (c.key !== "merch" && c.key !== "other"));
  const total = Math.max(1, f.tickets + f.merch + f.other_income);
  const any = f.tickets + f.merch + f.other_income > 0;
  return (
    <FigurePanel className="p-4">
      <CardLabel right={any ? <span className="text-ink-3 font-mono text-[11px]">{rupees(f.tickets + f.merch + f.other_income)} held</span> : null}>Where it came from</CardLabel>
      {!any ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">{s.scope === "club" ? "Nothing in yet. A paid event fills this in, online and at the door; a sponsor or a grant goes in the ledger." : "Nothing in yet for this event. Tickets land here by themselves; a sponsor goes in the ledger."}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((c) => (
            <li key={c.key}>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink truncate">
                  {c.label}
                  {c.count ? <span className="text-ink-3"> · {c.count} {c.key === "other" ? plural(c.count, "entry", "entries") : plural(c.count, "guest")}</span> : null}
                  {c.key === "other" && s.income_by_category.length ? <span className="text-ink-3"> · {s.income_by_category.map((r) => `${categoryLabel(r.category)} ${rupees(r.amount)}`).join(", ")}</span> : null}
                </span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                  {rupees(c.amount)} · {Math.round((100 * c.amount) / total)}%
                </span>
              </div>
              <ProgressBar value={c.amount} max={total} tone={c.key === "cash" || c.key === "other" ? "accent" : "admit"} className="mt-1" label={`${c.label} income`} />
            </li>
          ))}
        </ul>
      )}
      {f.refunds > 0 ? (
        <p className="text-ink-3 mt-3 text-[11.5px]">
          {rupees(f.refunds)} went back in {f.refund_count} {plural(f.refund_count, "refund")}; what is held is already net of it.
        </p>
      ) : f.avg_ticket !== null ? (
        <p className="text-ink-3 mt-3 text-[11.5px]">
          {rupees(f.avg_ticket)} a ticket on average{f.cost_per_head !== null && f.cost_per_head !== undefined ? ` · ${rupees(f.cost_per_head)} spent a head` : ""}.
        </p>
      ) : null}
    </FigurePanel>
  );
}

function ByType({ s }: { s: FinanceSummary }) {
  const rows = s.by_type;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.tickets + r.merch + r.other, r.expenses)));
  return (
    <FigurePanel className="p-4">
      <CardLabel>By event type</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">No events in this period.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => {
            const overhead = r.events === 0;
            const inn = r.tickets + r.merch + r.other;
            return (
              <li key={r.type}>
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-ink truncate">
                    {overhead ? "The club itself" : r.type}
                    {!overhead && <span className="text-ink-3"> · {r.events}</span>}
                  </span>
                  <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", r.net < 0 ? "text-refuse" : "text-ink-3")}>
                    {overhead && !r.other ? `−${rupees(r.expenses)}` : `${rupees(inn)} in · ${rupees(r.expenses)} out · ${rupees(r.net)} net`}
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  {!overhead || r.other > 0 ? <ProgressBar value={inn} max={max} tone="admit" className="flex-1" label={`${overhead ? "The club itself" : r.type} income`} /> : null}
                  <ProgressBar value={r.expenses} max={max} tone="caution" className="flex-1" label={`${overhead ? "The club itself" : r.type} spend`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FigurePanel>
  );
}

function EventBrief({ s }: { s: FinanceSummary }) {
  const f = s.figures;
  return (
    <FigurePanel className="p-4">
      <CardLabel>Where it stands</CardLabel>
      <div className="mt-3">
        <DefinitionRows
          rows={[
            { k: "Tickets held", v: rupees(f.tickets) },
            { k: "Merch", v: f.merch > 0 ? rupees(f.merch) : "—" },
            { k: "Besides", v: f.other_income > 0 ? `${rupees(f.other_income)} · ${f.other_income_count} ${plural(f.other_income_count, "entry", "entries")}` : "—" },
            { k: "Refunded", v: f.refunds > 0 ? `−${rupees(f.refunds)}` : "—" },
            { k: "Expenses", v: f.expenses > 0 ? `−${rupees(f.expenses)}` : "—" },
            { k: "Net", v: <strong>{rupees(f.net)}</strong> },
            { k: "Still owed", v: f.outstanding > 0 ? `${rupees(f.outstanding)} · ${f.outstanding_count}` : "—" },
            { k: "A ticket", v: f.avg_ticket !== null ? rupees(f.avg_ticket) : "—" },
            { k: "A head", v: f.cost_per_head !== null && f.cost_per_head !== undefined ? `${rupees(f.cost_per_head)} spent` : "—" },
          ]}
        />
      </div>
    </FigurePanel>
  );
}

// ─── By event ────────────────────────────────────────────────────────────

function statusOf(r: EventRow): { label: string; tone?: "accent" | "admit" } {
  if (r.status === "live") return { label: "Live", tone: "admit" };
  if (r.status === "closed" || r.status === "archived") return { label: "Closed" };
  return r.held ? { label: "Held" } : { label: "Upcoming", tone: "accent" };
}

const dash = <span className="text-ink-3">—</span>;

function EventsTable({ s }: { s: FinanceSummary }) {
  const [filter, setFilter] = React.useState<EventFilter>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const all = s.by_event;
  const counts = { all: all.length, held: all.filter((r) => r.held).length, ahead: all.filter((r) => !r.held).length };
  const rows = filter === "all" ? all : all.filter((r) => (filter === "held" ? r.held : !r.held));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const cols = "sm:grid-cols-[minmax(0,1.8fr)_90px_110px_110px_120px_90px_88px]";

  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which events">
          {EVENT_FILTERS.map((k) => (
            <Chip key={k} active={filter === k} onClick={() => { setFilter(k); setPage(1); }}>
              {EVENT_FILTER_LABEL[k]}
              {counts[k] ? ` ${counts[k]}` : ""}
            </Chip>
          ))}
        </div>
        <span className="text-ink-3 ml-auto text-[11.5px]">Each event&apos;s own page has its ledger and statement.</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState size="sm" title={filter === "all" ? "No events in this period" : filter === "held" ? "Nothing held yet in this period" : "Nothing ahead in this period"} description={filter === "all" ? "Widen the period, or publish an event." : undefined} />
      ) : (
        <>
          <div className={cn("text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid", cols)}>
            <span>Event</span>
            <span className="text-right">Guests</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="text-right">Net</span>
            <span className="text-right">Owed</span>
            <span className="text-right">Status</span>
          </div>
          <ul>
            {shown.map((r) => {
              const st = statusOf(r);
              const inn = r.tickets + r.merch + r.other_income;
              return (
                <li key={r.id} className="border-line-soft border-t">
                  <Link href={`/events/${r.id}/finance`} className={cn("hover:bg-sunken/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[12.5px] transition-colors", cols)} aria-label={`${r.name} finance`}>
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-[13.5px] font-medium">{r.name}</span>
                      <span className="text-ink-3 block truncate text-[11.5px]">
                        {formatDate(r.starts_at)} · {r.type}
                        {r.has_fee ? ` · ${rupees(r.fee)} a ticket` : " · free"}
                      </span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums sm:block">
                      <span className="text-ink block">{formatNumber(r.regs)}</span>
                      <span className="text-ink-3 block text-[11px]">{r.has_fee ? `${formatNumber(r.paying)} paid` : "free"}</span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums sm:block">
                      <span className="text-ink block">{inn ? rupees(inn) : dash}</span>
                      <span className="text-ink-3 block text-[11px]">{r.other_income > 0 ? `${rupees(r.other_income)} besides tickets` : r.cash > 0 ? `${rupees(r.cash)} at the door` : r.refunds > 0 ? `${rupees(r.refunds)} refunded` : ""}</span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums sm:block">
                      <span className="text-ink block">{r.expenses ? rupees(r.expenses) : dash}</span>
                      <span className="text-ink-3 block text-[11px]">{r.expense_count ? `${r.expense_count} ${plural(r.expense_count, "entry", "entries")}` : r.held && r.has_fee && inn > 0 ? "nothing logged" : ""}</span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums sm:block">
                      <span className={cn("block font-medium", r.net < 0 ? "text-refuse" : "text-ink")}>{inn || r.expenses ? rupees(r.net) : dash}</span>
                      <span className="text-ink-3 block text-[11px]">{r.margin !== null && r.margin !== undefined ? `${r.margin}% kept` : ""}</span>
                    </span>
                    <span className={cn("hidden text-right font-mono tabular-nums sm:block", r.outstanding > 0 ? "text-caution" : "text-ink-3")}>{r.outstanding > 0 ? rupees(r.outstanding) : "—"}</span>
                    <span className="text-right">
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > pageSize ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager page={page} pageCount={pageCount} total={rows.length} pageSize={pageSize} sizes={[10, 25, 50]} noun={["event", "events"]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </div>
          ) : null}
        </>
      )}
    </FigurePanel>
  );
}

// ─── The ledger ──────────────────────────────────────────────────────────

function Ledger({ scope, s, onEdit, onNew }: { scope: FinanceScope; s: FinanceSummary; onEdit: (x: Expense) => void; onNew: (kind: EntryKind) => void }) {
  const [kind, setKind] = React.useState<"all" | EntryKind>("all");
  const [category, setCategory] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const remove = useDeleteExpense();
  const pageSize = 10;
  const term = search.trim().toLowerCase();
  const rows = s.expenses.filter((x) => (kind === "all" || x.kind === kind) && (category === "all" || x.category === category) && (!term || x.title.toLowerCase().includes(term) || (x.note ?? "").toLowerCase().includes(term) || (x.event_name ?? "club").toLowerCase().includes(term)));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const counts = { expense: s.expenses.filter((x) => x.kind === "expense").length, income: s.expenses.filter((x) => x.kind === "income").length };
  const cats = (kind === "income" ? s.income_by_category : kind === "expense" ? s.by_category : []).filter((c) => c.count > 0);
  const pickKind = (k: "all" | EntryKind) => {
    setKind(k);
    setCategory("all");
    setPage(1);
  };
  const cols = scope.kind === "club" ? "sm:grid-cols-[100px_minmax(0,1.6fr)_minmax(0,1fr)_110px_110px_72px]" : "sm:grid-cols-[100px_minmax(0,1.6fr)_110px_110px_72px]";

  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which entries">
          <Chip active={kind === "all"} onClick={() => pickKind("all")}>
            Ledger{s.expenses.length ? ` ${s.expenses.length}` : ""}
          </Chip>
          <Chip active={kind === "expense"} onClick={() => pickKind("expense")}>
            Expenses{counts.expense ? ` ${counts.expense}` : ""}
          </Chip>
          <Chip active={kind === "income"} onClick={() => pickKind("income")}>
            Income{counts.income ? ` ${counts.income}` : ""}
          </Chip>
          {cats.length ? <span className="border-line-soft mx-1 hidden border-l sm:block" aria-hidden="true" /> : null}
          {cats.map((c) => (
            <Chip key={c.category} active={category === c.category} onClick={() => { setCategory(category === c.category ? "all" : c.category); setPage(1); }}>
              {categoryLabel(c.category)} {c.count}
            </Chip>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="bg-sunken text-ink-2 flex h-9 items-center gap-2 rounded-full px-3 sm:w-48">
            <SearchIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Title, note or event" aria-label="Search the ledger" className="text-ink placeholder:text-ink-3 w-full bg-transparent text-[12.5px] outline-none" />
          </label>
          <button type="button" className="btn btn-secondary h-9" onClick={() => onNew("expense")}>
            <PlusIcon className="size-4" /> Expense
          </button>
          <button type="button" className="btn btn-secondary h-9" onClick={() => onNew("income")}>
            <PlusIcon className="size-4" /> Income
          </button>
        </div>
      </div>
      {s.expenses.length === 0 ? (
        <EmptyState icon={<ReceiptIcon />} title="Nothing in the ledger yet" description="What went out — the venue, the food, the prizes — and what came in besides tickets — a sponsor, a grant. Log each as it happens and the net surplus becomes a real figure." action={<div className="flex gap-2"><button type="button" className="btn btn-primary" onClick={() => onNew("expense")}><PlusIcon className="size-4" /> Log an expense</button><button type="button" className="btn btn-secondary" onClick={() => onNew("income")}><PlusIcon className="size-4" /> Log an income</button></div>} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" title="Nothing matches" description="Try another word or category." />
      ) : (
        <>
          <div className={cn("text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid", cols)}>
            <span>Date</span>
            <span>Expense</span>
            {scope.kind === "club" ? <span>Against</span> : null}
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul>
            {shown.map((x) => (
              <li key={x.id} className={cn("border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2.5 text-[12.5px]", cols)}>
                <span className="text-ink-3 hidden font-mono text-[11.5px] tabular-nums sm:block">{formatDate(x.incurred_on)}</span>
                <span className="min-w-0">
                  <span className="text-ink block truncate font-medium">{x.title}</span>
                  <span className="text-ink-3 block truncate text-[11.5px]">
                    <span className="sm:hidden">{formatDate(x.incurred_on)} · </span>
                    {x.note ?? (scope.kind === "club" ? <span className="sm:hidden">{x.event_name ?? "Club"}</span> : null)}
                  </span>
                </span>
                {scope.kind === "club" ? (
                  <span className="text-ink-2 hidden truncate sm:block">
                    {x.event_id !== null ? (
                      <Link href={`/events/${x.event_id}/finance`} className="hover:underline">
                        {x.event_name}
                      </Link>
                    ) : (
                      "Club"
                    )}
                  </span>
                ) : null}
                <span className="text-ink-2 hidden sm:block">{categoryLabel(x.category)}</span>
                <span className={cn("text-right font-mono font-medium tabular-nums", x.kind === "income" ? "text-admit" : "text-ink")}>{x.kind === "income" ? `+${rupees(x.amount)}` : rupees(x.amount)}</span>
                <span className="flex items-center justify-end gap-1">
                  <button type="button" className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-7 place-items-center rounded-full border" aria-label={`Edit ${x.title}`} onClick={() => onEdit(x)}>
                    <PencilIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn("border-line bg-surface text-ink-2 hover:bg-sunken grid h-7 place-items-center rounded-full border", confirmId === x.id ? "text-refuse border-refuse-line px-2" : "hover:text-refuse size-7")}
                    aria-label={confirmId === x.id ? `Confirm removing ${x.title}` : `Remove ${x.title}`}
                    onClick={() => {
                      if (confirmId === x.id) {
                        remove.mutate(x.id);
                        setConfirmId(null);
                      } else setConfirmId(x.id);
                    }}
                  >
                    {confirmId === x.id ? <span className="text-[11.5px]">Remove?</span> : <Trash2Icon className="size-3.5" />}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {rows.length > pageSize ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager page={page} pageCount={pageCount} total={rows.length} pageSize={pageSize} noun={["entry", "entries"]} onPage={setPage} />
            </div>
          ) : null}
        </>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

function incomeNote(f: FinanceSummary["figures"]): string {
  const parts = [];
  if (f.online > 0) parts.push(`${rupees(f.online)} online`);
  if (f.cash > 0) parts.push(`${rupees(f.cash)} at the door`);
  if (f.merch > 0) parts.push(`${rupees(f.merch)} merch`);
  if (f.other_income > 0) parts.push(`${rupees(f.other_income)} besides tickets`);
  if (f.refunds > 0) parts.push(`${rupees(f.refunds)} refunded`);
  return parts.length ? parts.join(" · ") : "nothing in yet";
}

export function FinancePage({ scope }: { scope: FinanceScope }) {
  const [today] = React.useState(() => new Date());
  const [period, setPeriod] = React.useState<PeriodKey>("6m");
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: Expense | null; kind: EntryKind }>({ open: false, editing: null, kind: "expense" });
  const range = scope.kind === "club" ? periodRange(period, today) : {};
  const q = useFinance(scope, range);
  const s = q.data;
  const club = scope.kind === "club";
  const f = s?.figures;
  const a = s?.attention;
  const top = s?.by_category[0];
  const owedAt = a?.owed[0];
  const heldOwed = a ? a.owed.reduce((n, r) => n + r.outstanding, 0) : 0;
  const heldOwedCount = a ? a.owed.reduce((n, r) => n + r.outstanding_count, 0) : 0;
  const owedHref = club ? (owedAt ? `/events/${owedAt.id}/attendees` : undefined) : `/events/${(scope as { eventId: number }).eventId}/attendees`;
  const paidEvents = s ? s.by_event.filter((r) => r.has_fee).length : 0;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn("m-0 font-semibold tracking-[-0.02em]", club ? "page-title" : "text-[17px]")}>Finance</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {s && f
              ? club
                ? `${rupees(f.gross)} in · ${rupees(f.expenses)} out · ${rupees(f.net)} net · ${periodLabel(s.period.start, s.period.end)}${f.events ? ` · ${f.events.conducted} ${plural(f.events.conducted, "event")} held` : ""}`
                : `${rupees(f.gross)} in · ${rupees(f.expenses)} out · ${rupees(f.net)} net · ${formatNumber(f.paying)} of ${formatNumber(f.regs)} guests paid`
              : club
                ? "What the club's events brought and what they cost."
                : "What this event brought and what it cost."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {club && (
            <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="input h-9 w-[150px] py-0">
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <a href={statementUrl(scope, range)} download className="btn btn-secondary h-9">
            <DownloadIcon className="size-4" /> Export statement
          </a>
          <button type="button" className="btn btn-primary h-9" onClick={() => setDialog({ open: true, editing: null, kind: "expense" })}>
            <PlusIcon className="size-4" /> Add to ledger
          </button>
        </div>
      </div>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load the finances" description="Try reloading the page." />
      ) : !s || !f || !a ? (
        <>
          <Skeleton className="h-[108px]" />
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-[260px]" />
            <Skeleton className="h-[260px]" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Net surplus" value={rupees(f.net)} {...delta(s.deltas.net)} note={`${rupees(f.gross)} in · ${rupees(f.expenses)} out${f.margin !== null && f.margin !== undefined ? ` · ${f.margin}% kept` : ""}`} scale="hero" />
            <StatTile label="Income" value={rupees(f.gross)} {...delta(s.deltas.gross)} note={incomeNote(f)} />
            <StatTile label="Spent" value={rupees(f.expenses)} {...flat(s.deltas.expenses)} note={f.expense_count ? `${f.expense_count} ${plural(f.expense_count, "entry", "entries")}${top ? ` · most on ${categoryLabel(top.category).toLowerCase()}, ${rupees(top.amount)}` : ""}` : "nothing logged yet"} />
            <StatTile label="Still owed" value={rupees(f.outstanding)} note={f.outstanding_count ? `${f.outstanding_count} unpaid${club ? ` at ${paidEvents} paid ${plural(paidEvents, "event")}` : ""}` : "nobody owes anything"} action={f.outstanding_count && owedHref ? { label: "See who", href: owedHref } : undefined} linkAs={Link} />
          </div>

          {a.at_a_loss.length > 0 ? (
            <Notice tone="caution" tag="At a loss" action={<Link href={`/events/${a.at_a_loss[0]!.id}/finance`} className="btn btn-secondary text-[12px]">Open</Link>}>
              {a.at_a_loss[0]!.name} ran at a loss: {rupees(a.at_a_loss[0]!.expenses)} spent against {rupees(a.at_a_loss[0]!.tickets)} in{a.at_a_loss.length > 1 ? `, and ${a.at_a_loss.length - 1} more ${plural(a.at_a_loss.length - 1, "event")} did too` : ""}.
            </Notice>
          ) : heldOwed > 0 && owedAt ? (
            <Notice tone="caution" tag="Owed" action={<Link href={`/events/${owedAt.id}/attendees`} className="btn btn-secondary text-[12px]">See who</Link>}>
              {rupees(heldOwed)} is still owed by {heldOwedCount} {plural(heldOwedCount, "guest")} at {a.owed.length === 1 ? owedAt.name : `${a.owed.length} events already held`}. It will not arrive by itself.
            </Notice>
          ) : a.unlogged.length > 0 ? (
            <Notice tone="neutral" tag="Ledger" action={<button type="button" className="btn btn-secondary text-[12px]" onClick={() => setDialog({ open: true, editing: null, kind: "expense" })}>Log expense</button>}>
              {a.unlogged.length === 1 ? `${a.unlogged[0]!.name} took ${rupees(a.unlogged[0]!.tickets)} and has no expense logged, so its net is just its income.` : `${a.unlogged.length} held paid events have no expense logged, so their net is just their income.`}
            </Notice>
          ) : s.ahead.paid_events > 0 ? (
            <Notice tone="accent" tag="Selling">
              {s.ahead.paid_events} paid {plural(s.ahead.paid_events, "event")} ahead {s.ahead.paid_events === 1 ? "has" : "have"} taken {rupees(s.ahead.tickets)} from {formatNumber(s.ahead.regs)} {plural(s.ahead.regs, "guest")} so far{s.ahead.outstanding > 0 ? `, with ${rupees(s.ahead.outstanding)} still to collect` : ""}.
            </Notice>
          ) : f.gross > 0 && f.margin !== null && f.margin !== undefined ? (
            <Notice tone={f.margin >= 0 ? "admit" : "caution"} tag="Margin">
              {f.margin >= 0 ? `${f.margin}% of what came in stayed with the club.` : `The club spent ${rupees(f.expenses - f.tickets - f.merch - f.other_income)} more than came in.`}
            </Notice>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <InOut s={s} />
            <WhereItWent s={s} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {club ? <ByType s={s} /> : <EventBrief s={s} />}
            <WhereItCameFrom s={s} />
          </div>
          {club && <EventsTable s={s} />}
          <Ledger scope={scope} s={s} onEdit={(x) => setDialog({ open: true, editing: x, kind: x.kind })} onNew={(kind) => setDialog({ open: true, editing: null, kind })} />
          <ExpenseDialog scope={scope} events={s.by_event} categories={s.categories} incomeCategories={s.income_categories} editing={dialog.editing} kind={dialog.kind} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open, editing: open ? d.editing : null }))} />
        </>
      )}
    </div>
  );
}
