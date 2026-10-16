"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import {
  ChoiceCard,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moa/ui";

import { useCreateExpense, useUpdateExpense } from "../queries";
import {
  categoryLabel,
  expenseFormSchema,
  type EntryKind,
  type EventRow,
  type Expense,
  type FinanceScope,
} from "../schemas";

/**
 * Add to the ledger, or correct an entry. An entry is an expense — the
 * venue, the food, the prizes — or an income besides tickets — a sponsor,
 * a grant, a donation. The same dialog does both: opened from the button
 * it is blank, opened from a ledger row it carries that row. Against an
 * event, or against the club itself when it is an overhead or a grant to
 * the club as a whole.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

type Draft = {
  kind: EntryKind;
  title: string;
  category: string;
  amount: string;
  incurred_on: string;
  event_id: string;
  note: string;
};

const blank = (today: string, eventId: string, kind: EntryKind): Draft => ({
  kind,
  title: "",
  category: kind === "income" ? "sponsorship" : "other",
  amount: "",
  incurred_on: today,
  event_id: eventId,
  note: "",
});
const of = (x: Expense): Draft => ({
  kind: x.kind,
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
  incomeCategories: string[];
  editing: Expense | null;
  kind?: EntryKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The dialog's content mounts on each opening, so the form starts from what it was opened for: the row being corrected, or nothing. */
export function ExpenseDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <EntryForm
          key={props.editing?.id ?? `new-${props.kind ?? "expense"}`}
          {...props}
        />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  scope,
  events,
  categories,
  incomeCategories,
  editing,
  kind: startKind = "expense",
  onOpenChange,
}: Props) {
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));
  const fixedEvent = scope.kind === "event" ? String(scope.eventId) : "";
  const [draft, setDraft] = React.useState<Draft>(() =>
    editing ? of(editing) : blank(today, fixedEvent, startKind),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const busy = create.isPending || update.isPending;
  const income = draft.kind === "income";
  const options = income ? incomeCategories : categories;
  const set =
    (k: keyof Draft) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));
  const pickKind = (kind: EntryKind) =>
    setDraft((d) =>
      d.kind === kind
        ? d
        : { ...d, kind, category: kind === "income" ? "sponsorship" : "other" },
    );

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
          {editing ? `Correct “${editing.title}”` : "Add to the ledger"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "The ledger keeps the corrected figure; the statement follows."
            : "What the club paid for, or what came in besides tickets. The net is only as honest as this ledger."}
        </DialogDescription>
      </DialogHeader>
      <div
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Kind of entry"
      >
        <ChoiceCard
          checked={!income}
          onClick={() => pickKind("expense")}
          title="Expense"
          hint="Money that went out"
          tone="caution"
        />
        <ChoiceCard
          checked={income}
          onClick={() => pickKind("income")}
          title="Income"
          hint="Sponsorship, a grant, a donation"
          tone="admit"
        />
      </div>
      <div>
        <label htmlFor="expense-title" className={label}>
          {income ? "Where it came from" : "What it went on"}
        </label>
        <input
          id="expense-title"
          className={field}
          value={draft.title}
          onChange={set("title")}
          placeholder={
            income
              ? "Acme sponsorship, alumni donation…"
              : "Venue hire, pizza, prizes…"
          }
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
            className={field}
            value={draft.category}
            onChange={set("category")}
          >
            {options.map((c) => (
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
            className={field}
            value={draft.event_id}
            onChange={set("event_id")}
          >
            <option value="">
              {income ? "The club itself" : "The club itself (an overhead)"}
            </option>
            {events.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-ink-3 mt-1 text-[11.5px]">
            {income
              ? "Against an event, it adds to that event's net. Against the club, to the season's."
              : "Against an event, it comes off that event's net. Against the club, off the season's."}
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
          placeholder={
            income
              ? "Who gave it, what it was for, invoice number"
              : "Receipt number, who paid, what it covered"
          }
          maxLength={500}
        />
      </div>
      <DialogFooter>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : editing ? null : (
            <PlusIcon className="size-4" />
          )}{" "}
          {editing ? "Save changes" : "Save entry"}
        </button>
      </DialogFooter>
    </form>
  );
}
