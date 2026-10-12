"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import { CardLabel, Chip, DefinitionRows, EmptyState, FigurePanel, Pager, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { statementUrl } from "../api";
import { useCreateExpense, useDeleteExpense, useFinance, useUpdateExpense } from "../queries";
import {
  PERIODS,
  categoryLabel,
  expenseFormSchema,
  monthLabel,
  periodLabel,
  periodRange,
  type EventRow,
  type Expense,
  type FinanceScope,
  type FinanceSummary,
  type PeriodKey,
} from "../schemas";

/**
 * Finance: what the events brought and what they cost.
 *
 * Income is tickets. A refund is read back separately so the gross can be
 * shown; what is held is already net of it. Expenses are the club's own
 * ledger, logged here against an event or against the club. On the club's
 * page the period picks events by their date and every figure is a sum over
 * those events, so the tiles, the months, the types and the table agree.
 * An event's page needs no period: its money is its money.
 */
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Whole rupees read as whole rupees; paise show only when there are any. */
export const rupees = (n: number) => (Number.isInteger(n) ? INR.format(n) : INR_PAISE.format(n));

function delta(value: number | null, unit = "%"): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null) return { trend: "none" };
  return { delta: `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}${unit}`, trend: value > 0 ? "up" : value < 0 ? "down" : "none" };
}

/** Spending that grew is not good news, so its arrow stays neutral. */
const flat = (value: number | null) => ({ ...delta(value), trend: "none" as const });

/** ₹18.9k, ₹1.97L, ₹2.1Cr — for labels where the full figure would not fit. */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : String(Math.round(a));
  return `${n < 0 ? "−" : ""}₹${s}`;
}

const BRAND = "var(--brand, #17a58f)";
const SPEND = "#f59e0b";
const INK = "var(--muted-foreground, #979797)";
const LINE = "var(--border, #3d454f)";

// ─── Income by month ─────────────────────────────────────────────────────

function IncomeByMonth({ s }: { s: FinanceSummary }) {
  const rows = s.by_month;
  const W = 640;
  const H = 200;
  const PAD = { l: 8, r: 8, t: 26, b: 22 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, rows.length);
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.tickets, r.expenses)));
  const y = (v: number) => PAD.t + ih - (v / peak) * ih;
  const bw = Math.min(26, slot * 0.26);
  const spansYears = rows.length > 1 && rows[0]!.month.slice(0, 4) !== rows.at(-1)!.month.slice(0, 4);
  const empty = rows.every((r) => r.tickets === 0 && r.expenses === 0);

  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: BRAND }} /> Tickets
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-[3px]" style={{ background: SPEND }} /> Expenses
            </span>
          </span>
        }
      >
        Income by month
      </CardLabel>
      <p className="micro text-ink-3 mt-1">{s.scope === "club" ? "By the month the event was held · the figure above each pair is the net" : "By the month the money moved · the figure above each pair is the net"}</p>
      {empty ? (
        <p className="text-ink-3 mt-6 text-[13px]">Nothing moved in this period.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tickets and expenses by month" className="mt-3 h-auto w-full">
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={LINE} />
          {rows.map((r, i) => {
            const cx = PAD.l + slot * i + slot / 2;
            const top = Math.min(y(r.tickets), y(r.expenses));
            return (
              <g key={r.month}>
                <rect x={cx - bw - 1.5} y={y(r.tickets)} width={bw} height={PAD.t + ih - y(r.tickets)} rx={3} fill={BRAND} />
                <rect x={cx + 1.5} y={y(r.expenses)} width={bw} height={PAD.t + ih - y(r.expenses)} rx={3} fill={SPEND} opacity={0.9} />
                {(r.tickets > 0 || r.expenses > 0) && (
                  <text x={cx} y={top - 7} textAnchor="middle" fontSize={11} fill={INK} fontFamily="var(--font-plex-mono), ui-monospace, monospace">
                    {short(r.net)}
                  </text>
                )}
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={INK}>
                  {monthLabel(r.month)}
                  {spansYears ? ` ’${r.month.slice(2, 4)}` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </FigurePanel>
  );
}

// ─── Income by event type ────────────────────────────────────────────────

function IncomeByType({ s }: { s: FinanceSummary }) {
  const rows = s.by_type;
  const max = Math.max(1, ...rows.map((r) => (r.events === 0 ? r.expenses : r.tickets)));
  return (
    <FigurePanel className="p-4">
      <CardLabel>Income by event type</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[13px]">No events in this period.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((r) => {
            const overhead = r.events === 0;
            return (
              <li key={r.type}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink truncate">
                    {overhead ? "Club overheads" : r.type}
                    {!overhead && <span className="text-ink-3"> · {r.events}</span>}
                  </span>
                  <span className={cn("font-medium tabular-nums", overhead && "text-ink-2")}>{overhead ? `−${rupees(r.expenses)}` : rupees(r.tickets)}</span>
                </div>
                <ProgressBar value={overhead ? r.expenses : r.tickets} max={max} tone={overhead ? "caution" : "accent"} height={6} className="mt-1.5" label={`${overhead ? "Club overheads" : r.type} ${overhead ? "expenses" : "tickets"}`} />
              </li>
            );
          })}
        </ul>
      )}
    </FigurePanel>
  );
}

// ─── By event ────────────────────────────────────────────────────────────

function statusOf(r: EventRow, now: number): { label: string; tone?: "accent" | "admit" } {
  if (r.status === "live") return { label: "Live", tone: "admit" };
  if (r.status === "closed" || r.status === "archived") return { label: "Closed" };
  return new Date(r.starts_at).getTime() > now ? { label: "Upcoming", tone: "accent" } : { label: "Held" };
}

const money = (n: number) => (n === 0 ? <span className="text-ink-3">—</span> : rupees(n));

function ByEventTable({ s }: { s: FinanceSummary }) {
  const [now] = React.useState(() => Date.now());
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const rows = s.by_event;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const th = "eyebrow px-3 py-2 text-left";
  const num = "px-3 py-2.5 text-right tabular-nums";

  return (
    <FigurePanel className="overflow-hidden">
      <div className="px-4 pt-4">
        <CardLabel right={<span className="text-ink-3 text-[11px]">{rows.length} {plural(rows.length, "event")}</span>}>By event</CardLabel>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-3 px-4 pb-4 pt-3 text-[13px]">No events in this period.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line-soft border-b">
                <th className={th}>Event</th>
                <th className={cn(th, "text-right")}>Regs</th>
                <th className={cn(th, "text-right")}>Tickets</th>
                <th className={cn(th, "text-right")}>Refunds</th>
                <th className={cn(th, "text-right")}>Expenses</th>
                <th className={cn(th, "text-right")}>Net</th>
                <th className={cn(th, "text-right")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = statusOf(r, now);
                return (
                  <tr key={r.id} className="border-line-soft border-b last:border-0">
                    <td className="px-3 py-2.5">
                      <Link href={`/events/${r.id}/finance`} className="text-ink font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-ink-3 micro mt-0.5">
                        {formatDate(r.starts_at)} · {r.type}
                      </div>
                    </td>
                    <td className={num}>{formatNumber(r.regs)}</td>
                    <td className={num}>{money(r.tickets)}</td>
                    <td className={cn(num, r.refunds > 0 && "text-refuse")}>{r.refunds > 0 ? `−${rupees(r.refunds)}` : <span className="text-ink-3">—</span>}</td>
                    <td className={num}>{money(r.expenses)}</td>
                    <td className={cn(num, "font-medium", r.net < 0 && "text-refuse")}>{rupees(r.net)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > pageSize && (
        <div className="px-4 pb-3">
          <Pager page={page} pageCount={pageCount} total={rows.length} pageSize={pageSize} sizes={[10, 25, 50]} noun={["event", "events"]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      )}
    </FigurePanel>
  );
}

// ─── Expenses ────────────────────────────────────────────────────────────

const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

type Draft = { title: string; category: string; amount: string; incurred_on: string; event_id: string; note: string };

const blank = (today: string, eventId: string): Draft => ({ title: "", category: "other", amount: "", incurred_on: today, event_id: eventId, note: "" });

function ExpensesPanel({ scope, s }: { scope: FinanceScope; s: FinanceSummary }) {
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));
  const fixedEvent = scope.kind === "event" ? String(scope.eventId) : "";
  const [draft, setDraft] = React.useState<Draft>(() => blank(today, fixedEvent));
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const busy = create.isPending || update.isPending;
  const pageSize = 8;
  const rows = s.expenses;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const reset = () => {
    setDraft(blank(today, fixedEvent));
    setEditing(null);
    setErrors({});
  };

  const edit = (x: Expense) => {
    setEditing(x);
    setDraft({ title: x.title, category: x.category, amount: String(x.amount), incurred_on: x.incurred_on, event_id: x.event_id === null ? "" : String(x.event_id), note: x.note ?? "" });
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = expenseFormSchema.safeParse({ ...draft, event_id: draft.event_id === "" ? null : draft.event_id });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setErrors({});
    if (editing) await update.mutateAsync({ id: editing.id, form: parsed.data });
    else await create.mutateAsync(parsed.data);
    reset();
  };

  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 text-[11px]">{rupees(s.figures.expenses)} · {s.figures.expense_count} {plural(s.figures.expense_count, "entry", "entries")}</span>}>Expenses</CardLabel>
      <form onSubmit={submit} noValidate className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="expense-title" className={label}>
            What it went on
          </label>
          <input id="expense-title" className={field} value={draft.title} onChange={set("title")} placeholder="Venue hire, pizza, prizes…" maxLength={120} />
          {errors.title && <p className="text-refuse mt-1 text-[12px]">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor="expense-category" className={label}>
            Category
          </label>
          <select id="expense-category" className={cn(field, "py-0")} value={draft.category} onChange={set("category")}>
            {s.categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="expense-amount" className={label}>
            Amount · ₹
          </label>
          <input id="expense-amount" className={field} inputMode="decimal" value={draft.amount} onChange={set("amount")} placeholder="0" />
          {errors.amount && <p className="text-refuse mt-1 text-[12px]">{errors.amount}</p>}
        </div>
        <div>
          <label htmlFor="expense-date" className={label}>
            Date
          </label>
          <input id="expense-date" type="date" className={field} value={draft.incurred_on} onChange={set("incurred_on")} />
          {errors.incurred_on && <p className="text-refuse mt-1 text-[12px]">{errors.incurred_on}</p>}
        </div>
        {scope.kind === "club" && (
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="expense-event" className={label}>
              Against
            </label>
            <select id="expense-event" className={cn(field, "py-0")} value={draft.event_id} onChange={set("event_id")}>
              <option value="">The club itself (an overhead)</option>
              {s.by_event.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={cn("sm:col-span-2", scope.kind === "club" ? "lg:col-span-2" : "lg:col-span-4")}>
          <label htmlFor="expense-note" className={label}>
            Note (optional)
          </label>
          <input id="expense-note" className={field} value={draft.note} onChange={set("note")} placeholder="Receipt number, who paid, what it covered" maxLength={500} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="btn btn-primary h-9" disabled={busy}>
            {editing ? "Save changes" : "Log expense"}
          </button>
          {editing && (
            <button type="button" className="btn btn-ghost h-9" onClick={reset}>
              <XIcon className="size-4" /> Cancel
            </button>
          )}
          {editing && <span className="text-ink-3 text-[12px]">Editing “{editing.title}”</span>}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-ink-3 mt-5 text-[13px]">Nothing logged yet. The first entry turns the net surplus into a real figure.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line-soft border-b">
                <th className="eyebrow px-2 py-2 text-left">Date</th>
                <th className="eyebrow px-2 py-2 text-left">Expense</th>
                {scope.kind === "club" && <th className="eyebrow px-2 py-2 text-left">Against</th>}
                <th className="eyebrow px-2 py-2 text-left">Category</th>
                <th className="eyebrow px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id} className="border-line-soft border-b last:border-0">
                  <td className="text-ink-2 px-2 py-2 whitespace-nowrap tabular-nums">{formatDate(x.incurred_on)}</td>
                  <td className="px-2 py-2">
                    <div className="text-ink font-medium">{x.title}</div>
                    {x.note && <div className="text-ink-3 micro mt-0.5">{x.note}</div>}
                  </td>
                  {scope.kind === "club" && <td className="text-ink-2 px-2 py-2">{x.event_name ?? "Club"}</td>}
                  <td className="text-ink-2 px-2 py-2">{categoryLabel(x.category)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{rupees(x.amount)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button type="button" className="btn btn-ghost h-7 px-2" aria-label={`Edit ${x.title}`} onClick={() => edit(x)}>
                      <PencilIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn("btn btn-ghost h-7 px-2", confirmId === x.id && "text-refuse")}
                      aria-label={confirmId === x.id ? `Confirm removing ${x.title}` : `Remove ${x.title}`}
                      onClick={() => {
                        if (confirmId === x.id) {
                          remove.mutate(x.id);
                          setConfirmId(null);
                        } else setConfirmId(x.id);
                      }}
                    >
                      {confirmId === x.id ? <span className="text-[12px]">Remove?</span> : <Trash2Icon className="size-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > pageSize && <Pager page={page} pageCount={pageCount} total={rows.length} pageSize={pageSize} noun={["entry", "entries"]} onPage={setPage} />}
        </div>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

function Tiles({ s }: { s: FinanceSummary }) {
  const f = s.figures;
  const d = s.deltas;
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {f.events ? (
        <StatTile label="Events conducted" value={formatNumber(f.events.conducted)} {...delta(f.events.delta)} note={`+${f.events.upcoming} upcoming`} />
      ) : (
        <StatTile label="Paying guests" value={formatNumber(f.paying)} note={`of ${formatNumber(f.regs)} registered${f.avg_ticket !== null ? ` · ${rupees(f.avg_ticket)} each` : ""}`} />
      )}
      <StatTile label="Gross income" value={rupees(f.gross)} {...delta(d.gross)} note={`${rupees(f.tickets)} held · ${rupees(f.refunds)} refunded`} />
      <StatTile label="Expenses" value={rupees(f.expenses)} {...flat(d.expenses)} note={`${f.expense_count} ${plural(f.expense_count, "entry", "entries")} logged`} />
      <StatTile label="Net surplus" value={rupees(f.net)} {...delta(d.net)} note="After refunds and expenses" />
      <StatTile label="Outstanding" value={rupees(f.outstanding)} note={`${f.outstanding_count} unpaid at paid events`} />
      <StatTile label="Refunds" value={rupees(f.refunds)} {...flat(d.refunds)} note={`${f.refund_count} ${plural(f.refund_count, "refund")}`} />
    </div>
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
            { k: "Refunded", v: f.refunds > 0 ? `−${rupees(f.refunds)}` : "—" },
            { k: "Expenses", v: f.expenses > 0 ? `−${rupees(f.expenses)}` : "—" },
            { k: "Net", v: <strong>{rupees(f.net)}</strong> },
            { k: "Still owed", v: f.outstanding > 0 ? `${rupees(f.outstanding)} · ${f.outstanding_count}` : "—" },
            { k: "Average ticket", v: f.avg_ticket !== null ? rupees(f.avg_ticket) : "—" },
          ]}
        />
      </div>
    </FigurePanel>
  );
}

export function FinancePage({ scope }: { scope: FinanceScope }) {
  const [today] = React.useState(() => new Date());
  const [period, setPeriod] = React.useState<PeriodKey>("6m");
  const range = scope.kind === "club" ? periodRange(period, today) : {};
  const q = useFinance(scope, range);
  const s = q.data;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn("m-0 font-semibold tracking-[-0.02em]", scope.kind === "club" ? "page-title" : "text-[17px]")}>Finance</h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {s ? (scope.kind === "club" ? `Tickets, refunds and expenses · ${periodLabel(s.period.start, s.period.end)}` : "What this event brought and what it cost") : "Tickets, refunds and expenses"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scope.kind === "club" && (
            <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="input h-9 w-[160px] py-0">
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
        </div>
      </header>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load the finances" description="Try reloading the page." />
      ) : !s ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <Tiles s={s} />
          <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <IncomeByMonth s={s} />
            {scope.kind === "club" ? <IncomeByType s={s} /> : <EventBrief s={s} />}
          </div>
          {scope.kind === "club" && <ByEventTable s={s} />}
          <ExpensesPanel scope={scope} s={s} />
        </>
      )}
    </div>
  );
}
