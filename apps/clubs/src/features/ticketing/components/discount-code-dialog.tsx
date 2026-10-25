"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NativeSelect,
  Segmented,
  Switch,
} from "@moa/ui";

import { useClubEvents } from "@/features/events";

import { useCreateDiscountCode, useTicketTypes, useUpdateDiscountCode } from "../queries";
import { codeFormSchema, normaliseCode, toLocalInput, type CodeFormInput, type DiscountCode } from "../schemas";

/**
 * Make or change a discount code. Its text and its event are set when it
 * is made and never change after (a code already shared must keep meaning
 * what it meant); everything else can.
 *
 * A code for one event may be held to some of its ticket types; a code for
 * every event of the club takes any type.
 *
 * The caller gives it a fresh `key` each time it opens, so it starts from
 * the code (or blank) every time.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

function startFrom(code: DiscountCode | null, eventId: number | null): CodeFormInput {
  if (code) {
    return {
      code: code.code,
      kind: code.kind,
      value: code.value,
      event_id: code.event_id ? String(code.event_id) : "",
      ticket_type_ids: code.ticket_type_ids ?? [],
      starts_at: toLocalInput(code.starts_at),
      ends_at: toLocalInput(code.ends_at),
      max_uses: code.max_uses ?? undefined,
      per_person_limit: code.per_person_limit ?? undefined,
      is_active: code.is_active,
    };
  }
  return { code: "", kind: "percent", value: undefined as unknown as number, event_id: eventId ? String(eventId) : "", ticket_type_ids: [], starts_at: "", ends_at: "", max_uses: undefined, per_person_limit: undefined, is_active: true };
}

export function DiscountCodeDialog({
  open,
  onOpenChange,
  code,
  eventId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The code being changed; null to make one. */
  code: DiscountCode | null;
  /** On an event's page: the code is that event's. */
  eventId?: number | null;
}) {
  const editing = code !== null;
  const [form, setForm] = React.useState<CodeFormInput>(() => startFrom(code, eventId));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const create = useCreateDiscountCode();
  const update = useUpdateDiscountCode();
  const saving = create.isPending || update.isPending;
  const events = useClubEvents({ offset: 0, limit: 100 });
  const chosenEvent = form.event_id ? Number(form.event_id) : null;
  const types = useTicketTypes(chosenEvent, open && chosenEvent !== null);
  const typeList = types.data?.types ?? [];

  const set = <K extends keyof CodeFormInput>(key: K, value: CodeFormInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = codeFormSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0] ?? "form")] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      if (editing) await update.mutateAsync({ id: code.id, form: parsed.data });
      else await create.mutateAsync(parsed.data);
      onOpenChange(false);
    } catch {
      // The toast (or the upgrade dialog) has said why; the form stays as typed.
    }
  };

  const err = (key: string) =>
    errors[key] ? (
      <p role="alert" className="text-refuse mt-1 text-[12px]">
        {errors[key]}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${code.code}` : "New discount code"}</DialogTitle>
          <DialogDescription>
            {editing ? "The code's text and its event stay as they are; everything else can change." : "People type it when they register. The price is worked out for them; a code worth the whole ticket makes it free, with no payment step."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code-text" className={label}>
                Code
              </label>
              <input
                id="code-text"
                className={`${field} font-mono uppercase`}
                value={form.code ?? ""}
                disabled={editing}
                maxLength={40}
                placeholder="EARLYBIRD"
                onChange={(e) => set("code", normaliseCode(e.target.value))}
              />
              {err("code")}
            </div>
            <div>
              <label htmlFor="code-event" className={label}>
                Works on
              </label>
              <NativeSelect
                id="code-event"
                value={form.event_id ?? ""}
                disabled={editing || eventId !== null}
                onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value, ticket_type_ids: [] }))}
              >
                <option value="">Every event of the club</option>
                {(events.data?.items ?? []).map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>
                    {ev.name}
                  </option>
                ))}
                {code?.event_id && !(events.data?.items ?? []).some((ev) => ev.id === code.event_id) ? <option value={String(code.event_id)}>{code.event_name ?? `Event ${code.event_id}`}</option> : null}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Takes off</span>
              <Segmented
                label="Takes off"
                value={form.kind ?? "percent"}
                options={[
                  { value: "percent", label: "A percentage" },
                  { value: "amount", label: "An amount" },
                ]}
                onChange={(v) => set("kind", v)}
              />
            </div>
            <div>
              <label htmlFor="code-value" className={label}>
                {form.kind === "amount" ? "Rupees off" : "Percent off"}
              </label>
              <input id="code-value" className={field} type="number" inputMode="decimal" min="0" step="any" value={(form.value as number | undefined) ?? ""} onChange={(e) => set("value", e.target.value as unknown as number)} />
              {err("value")}
            </div>
          </div>

          {chosenEvent !== null && typeList.length > 1 ? (
            <fieldset>
              <legend className={label}>Ticket types (none ticked: any)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {typeList.map((t) => {
                  const ticked = (form.ticket_type_ids ?? []).includes(t.id);
                  return (
                    <label key={t.id} className="text-ink-2 inline-flex items-center gap-2 text-[13px]">
                      <Checkbox
                        checked={ticked}
                        onCheckedChange={(next) =>
                          set("ticket_type_ids", next === true ? [...(form.ticket_type_ids ?? []), t.id] : (form.ticket_type_ids ?? []).filter((id) => id !== t.id))
                        }
                        aria-label={t.name}
                      />
                      {t.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code-starts" className={label}>
                From (optional)
              </label>
              <input id="code-starts" className={field} type="datetime-local" value={form.starts_at ?? ""} onChange={(e) => set("starts_at", e.target.value)} />
            </div>
            <div>
              <label htmlFor="code-ends" className={label}>
                Until (optional)
              </label>
              <input id="code-ends" className={field} type="datetime-local" value={form.ends_at ?? ""} onChange={(e) => set("ends_at", e.target.value)} />
              {err("ends_at")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code-max" className={label}>
                Uses in all (optional)
              </label>
              <input id="code-max" className={field} type="number" min="1" step="1" inputMode="numeric" placeholder="No limit" value={(form.max_uses as number | undefined) ?? ""} onChange={(e) => set("max_uses", e.target.value as unknown as number)} />
              {err("max_uses")}
            </div>
            <div>
              <label htmlFor="code-person" className={label}>
                Uses per person (optional)
              </label>
              <input id="code-person" className={field} type="number" min="1" step="1" inputMode="numeric" placeholder="No limit" value={(form.per_person_limit as number | undefined) ?? ""} onChange={(e) => set("per_person_limit", e.target.value as unknown as number)} />
              {err("per_person_limit")}
            </div>
          </div>
          <p className="text-ink-3 -mt-2 text-[12px]">A use counts once a ticket is paid for, or confirmed with nothing to pay, and comes back if it is refunded or cancelled.</p>

          <label className="text-ink-2 flex items-center justify-between gap-3 text-[13px]">
            <span>On: people can use it now</span>
            <Switch checked={form.is_active ?? true} onCheckedChange={(v) => set("is_active", v)} aria-label="Code is on" />
          </label>

          <DialogFooter>
            <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null} {editing ? "Save code" : "Make code"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
