import { z } from "zod";

/** The club's season, or one event: an event's money is its money, so it needs no period. */
export type FinanceScope = { kind: "event"; eventId: number } | { kind: "club" };

const money = z.number();

export const KINDS = ["expense", "income"] as const;
export type EntryKind = (typeof KINDS)[number];

export const expenseSchema = z.object({
  id: z.string(),
  event_id: z.number().nullable(),
  event_name: z.string().nullable(),
  kind: z.enum(KINDS).default("expense"),
  title: z.string(),
  category: z.string(),
  amount: money,
  incurred_on: z.string(),
  note: z.string().nullable(),
  created_at: z.string(),
});

export const financeSummarySchema = z.object({
  scope: z.enum(["club", "event"]),
  period: z.object({ start: z.string(), end: z.string() }),
  figures: z.object({
    events: z.object({ conducted: z.number(), upcoming: z.number(), delta: z.number().nullable() }).nullable(),
    regs: z.number(),
    paying: z.number(),
    gross: money,
    tickets: money,
    merch: money.default(0),
    other_income: money.default(0),
    other_income_count: z.number().default(0),
    refunds: money,
    refund_count: z.number(),
    online: money.default(0),
    online_count: z.number().default(0),
    cash: money.default(0),
    cash_count: z.number().default(0),
    expenses: money,
    expense_count: z.number(),
    net: money,
    margin: z.number().nullish(),
    outstanding: money,
    outstanding_count: z.number(),
    avg_ticket: money.nullable(),
    cost_per_head: money.nullish(),
  }),
  deltas: z.object({
    gross: z.number().nullable(),
    tickets: z.number().nullable(),
    merch: z.number().nullish(),
    refunds: z.number().nullable(),
    expenses: z.number().nullable(),
    net: z.number().nullable(),
  }),
  by_month: z.array(z.object({ month: z.string(), tickets: money, merch: money.default(0), other: money.default(0), refunds: money, expenses: money, net: money })),
  by_type: z.array(z.object({ type: z.string(), events: z.number(), tickets: money, merch: money.default(0), other: money.default(0), expenses: money, net: money })),
  by_event: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      starts_at: z.string(),
      type: z.string(),
      status: z.string(),
      held: z.boolean().default(false),
      has_fee: z.boolean().default(false),
      fee: money.default(0),
      regs: z.number(),
      paying: z.number(),
      tickets: money,
      merch: money.default(0),
      other_income: money.default(0),
      online: money.default(0),
      cash: money.default(0),
      refunds: money,
      expenses: money,
      expense_count: z.number().default(0),
      net: money,
      margin: z.number().nullish(),
      outstanding: money.default(0),
      outstanding_count: z.number().default(0),
    })
  ),
  expenses: z.array(expenseSchema),
  by_category: z.array(z.object({ category: z.string(), amount: money, count: z.number() })).default([]),
  income_by_category: z.array(z.object({ category: z.string(), amount: money, count: z.number() })).default([]),
  channels: z.array(z.object({ key: z.string(), label: z.string(), amount: money, count: z.number() })).default([]),
  attention: z
    .object({
      at_a_loss: z.array(z.object({ id: z.number(), name: z.string(), net: money, tickets: money, expenses: money })).default([]),
      owed: z.array(z.object({ id: z.number(), name: z.string(), outstanding: money, outstanding_count: z.number() })).default([]),
      unlogged: z.array(z.object({ id: z.number(), name: z.string(), tickets: money })).default([]),
    })
    .default({ at_a_loss: [], owed: [], unlogged: [] }),
  ahead: z.object({ events: z.number(), paid_events: z.number(), regs: z.number(), tickets: money, outstanding: money, outstanding_count: z.number(), expenses: money }).default({ events: 0, paid_events: 0, regs: 0, tickets: 0, outstanding: 0, outstanding_count: 0, expenses: 0 }),
  categories: z.array(z.string()),
  income_categories: z.array(z.string()).default(["sponsorship", "grant", "donation", "sales", "fees", "other"]),
  generated_at: z.string(),
});

export type Expense = z.infer<typeof expenseSchema>;
export type FinanceSummary = z.infer<typeof financeSummarySchema>;
export type EventRow = FinanceSummary["by_event"][number];

export const EVENT_FILTERS = ["all", "held", "ahead"] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];
export const EVENT_FILTER_LABEL: Record<EventFilter, string> = { all: "All", held: "Held", ahead: "Ahead" };

export const expenseFormSchema = z.object({
  kind: z.enum(KINDS).default("expense"),
  title: z.string().trim().min(1, "Say what the money went on").max(120, "Keep the title under 120 characters"),
  category: z.string().min(1),
  amount: z.coerce.number({ message: "Enter the amount" }).positive("The amount must be more than zero").max(99_999_999.99, "That is more than the ledger can hold"),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  event_id: z.coerce.number().int().nullable(),
  note: z.string().trim().max(500, "Keep the note under 500 characters"),
});
export type ExpenseForm = z.infer<typeof expenseFormSchema>;

export const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue",
  food: "Food & drink",
  prizes: "Prizes",
  printing: "Printing",
  marketing: "Marketing",
  equipment: "Equipment",
  travel: "Travel",
  speakers: "Speakers",
  other: "Other",
};
export const INCOME_CATEGORY_LABELS: Record<string, string> = {
  sponsorship: "Sponsorship",
  grant: "Grant",
  donation: "Donation",
  sales: "Sales",
  fees: "Fees",
  other: "Other",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? INCOME_CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

/** Period presets; each is a `from` date relative to today, `null` meaning all time. */
export const PERIODS = [
  { key: "6m", label: "Last 6 months" },
  { key: "3m", label: "Last 3 months" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const firstOf = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 1)));
const lastOf = (y: number, m: number) => iso(new Date(Date.UTC(y, m + 1, 0)));

/** Every window runs into the future, so the events selling now sit beside the ones just held. */
export function periodRange(key: PeriodKey, today: Date): { from?: string; to?: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (key) {
    case "month":
      return { from: firstOf(y, m), to: lastOf(y, m) };
    case "3m":
      return { from: firstOf(y, m - 1), to: lastOf(y, m + 1) };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
      return { from: "2015-01-01", to: `${y + 1}-12-31` };
    default:
      return {};
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

/** "Jul to Nov 2026" or "Nov 2025 to Apr 2026". */
export function periodLabel(start: string, end: string): string {
  const [sy, sm] = [start.slice(0, 4), monthLabel(start)];
  const [ey, em] = [end.slice(0, 4), monthLabel(end)];
  if (sy === ey) return sm === em ? `${sm} ${sy}` : `${sm} to ${em} ${sy}`;
  return `${sm} ${sy} to ${em} ${ey}`;
}
