"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@moa/ui";

import { useCreateExpense, useUpdateExpense } from "../queries";
import {
  categoryLabel,
  expenseFormSchema,
  type EventRow,
  type Expense,
  type FinanceScope,
} from "../schemas";

/**
 * Log an expense, or correct one. The same dialog does both: opened from
 * the button it is blank, opened from a ledger row it carries that row.
 * An expense is against an event, or against the club itself when it
 * is an overhead — a domain, a subscription, a banner reused all year.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

type Draft = {
  title: string;
  category: string;
  amount: string;
  incurred_on: string;
  event_id: string;
  note: string;
};

const blank = (today: string, eventId: string): Draft => ({
  title: "",
  category: "other",
  amount: "",
  incurred_on: today,
  event_id: eventId,
  note: "",
});
const of = (x: Expense): Draft => ({
  title: x.title,
  category: x.category,
  amount: String(x.amount),
  incurred_on: x.incurred_on,
  event_id: x.event_id === null ? "" : String(x.event_id),
  note: x.note ?? "",
});

type Props = {
  scope: FinanceScope;
  events: EventRow[];
  categories: string[];
  editing: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The dialog's content mounts on each opening, so the form starts from what it was opened for: the row being corrected, or nothing. */
export function ExpenseDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <ExpenseForm key={props.editing?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  scope,
  events,
  categories,
  editing,
  onOpenChange,
}: Props) {
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));
  const fixedEvent = scope.kind === "event" ? String(scope.eventId) : "";
  const [draft, setDraft] = React.useState<Draft>(() =>
    editing ? of(editing) : blank(today, fixedEvent),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const busy = create.isPending || update.isPending;
  const set =
    (k: keyof Draft) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = expenseFormSchema.safeParse({
      ...draft,
      event_id: draft.event_id === "" ? null : draft.event_id,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [
            String(i.path[0] ?? "form"),
            i.message,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    if (editing)
      await update.mutateAsync({ id: editing.id, form: parsed.data });
    else await create.mutateAsync(parsed.data);
    onOpenChange(false);
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {editing ? `Correct “${editing.title}”` : "Log an expense"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "The ledger keeps the corrected figure; the statement follows."
            : "What the club paid for, against the event it was for or against the club itself. The net is only as honest as this ledger."}
        </DialogDescription>
      </DialogHeader>
      <div>
        <label htmlFor="expense-title" className={label}>
          What it went on
        </label>
        <input
          id="expense-title"
          className={field}
          value={draft.title}
          onChange={set("title")}
          placeholder="Venue hire, pizza, prizes…"
          maxLength={120}
          autoFocus
        />
        {errors.title && (
          <p className="text-refuse mt-1 text-[12px]">{errors.title}</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="expense-amount" className={label}>
            Amount · ₹
          </label>
          <input
            id="expense-amount"
            className={field}
            inputMode="decimal"
            value={draft.amount}
            onChange={set("amount")}
            placeholder="0"
          />
          {errors.amount && (
            <p className="text-refuse mt-1 text-[12px]">{errors.amount}</p>
          )}
        </div>
        <div>
          <label htmlFor="expense-category" className={label}>
            Category
          </label>
          <select
            id="expense-category"
            className={cn(field, "py-0")}
            value={draft.category}
            onChange={set("category")}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="expense-date" className={label}>
            Date
          </label>
          <input
            id="expense-date"
            type="date"
            className={field}
            value={draft.incurred_on}
            onChange={set("incurred_on")}
          />
          {errors.incurred_on && (
            <p className="text-refuse mt-1 text-[12px]">{errors.incurred_on}</p>
          )}
        </div>
      </div>
      {scope.kind === "club" && (
        <div>
          <label htmlFor="expense-event" className={label}>
            Against
          </label>
          <select
            id="expense-event"
            className={cn(field, "py-0")}
            value={draft.event_id}
            onChange={set("event_id")}
          >
            <option value="">The club itself (an overhead)</option>
            {events.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-ink-3 mt-1 text-[11.5px]">
            Against an event, it comes off that event&apos;s net. Against the
            club, it comes off the season&apos;s.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="expense-note" className={label}>
          Note (optional)
        </label>
        <input
          id="expense-note"
          className={field}
          value={draft.note}
          onChange={set("note")}
          placeholder="Receipt number, who paid, what it covered"
          maxLength={500}
        />
      </div>
      <DialogFooter>
        <button
          type="button"
          className="btn btn-ghost h-9"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary h-9" disabled={busy}>
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : editing ? null : (
            <PlusIcon className="size-4" />
          )}{" "}
          {editing ? "Save changes" : "Save expense"}
        </button>
      </DialogFooter>
    </form>
  );
}
