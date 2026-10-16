import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import { expenseSchema, financeSummarySchema, type ExpenseForm, type FinanceScope } from "./schemas";

type Range = { from?: string; to?: string };

const summaryPath = (scope: FinanceScope) => (scope.kind === "event" ? `/api/v1/events/${scope.eventId}/finance` : "/api/v1/clubs/finance");

const qs = (range: Range) => {
  const p = new URLSearchParams();
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export async function fetchFinance(scope: FinanceScope, range: Range) {
  const raw = await api.get<unknown>(summaryPath(scope), scope.kind === "club" ? { query: range } : undefined);
  return financeSummarySchema.parse(raw);
}

/**
 * The statement is a file download, so it is a plain link through the
 * gateway (the auth cookie stays first-party) rather than a fetch.
 */
export function statementUrl(scope: FinanceScope, range: Range): string {
  return `${GATEWAY_PREFIX}${summaryPath(scope)}/statement.csv${scope.kind === "club" ? qs(range) : ""}`;
}

function body(form: ExpenseForm) {
  return {
    event_id: form.event_id,
    kind: form.kind,
    title: form.title,
    category: form.category,
    amount: form.amount,
    incurred_on: form.incurred_on,
    note: form.note || null,
  };
}

export async function createExpense(form: ExpenseForm) {
  const raw = await api.post<unknown>("/api/v1/clubs/finance/expenses", body(form));
  return expenseSchema.parse(raw);
}

export async function updateExpense(id: string, form: ExpenseForm) {
  const raw = await api.patch<unknown>(`/api/v1/clubs/finance/expenses/${id}`, body(form));
  return expenseSchema.parse(raw);
}

export async function deleteExpense(id: string) {
  await api.del<unknown>(`/api/v1/clubs/finance/expenses/${id}`);
}
