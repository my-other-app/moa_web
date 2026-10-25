"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ArrowDownIcon, ArrowUpIcon, EyeOffIcon, LockIcon, PlusIcon, TicketIcon, Trash2Icon } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage, IconButton, Input, Switch, cn } from "@moa/ui";

import { LockBadge, useEventPlan, useLimitGate } from "@/features/plan";

import { useTicketingOnServer } from "../queries";
import { DEFAULT_TYPE_NAME, blankType, priceText, type TicketTypeDraft } from "../schemas";

/**
 * The event's ticket types, in the event form's "Places and money".
 *
 * One kind of ticket is the event's own: its fee and its places above, as
 * every event had before types. "Sell several ticket types" turns that into
 * a list -- the first row keeps the event's fee and places -- each type with
 * its own price (0 is free), places, sales window, per-person limit, and
 * whether it is listed. "Places" above becomes an optional total across all
 * of them. Saved with the event (PUT /events/{id}/ticketing/types).
 *
 * Shown only when the API has ticket types: editing, once the event's types
 * have loaded; making one, once the server is known to have them.
 */
interface Row extends TicketTypeDraft {
  /** useFieldArray's own key. */
  key?: string;
}

const field = "h-9";

function TypeRow({
  index,
  count,
  priceLocked,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  priceLocked: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const form = useFormContext();
  const row = useWatch({ control: form.control, name: `ticket_types.${index}` }) as Row | undefined;
  const held = Boolean(row?.has_registrations);
  const name = row?.name?.trim() || `Type ${index + 1}`;
  return (
    <li className={cn("border-line bg-surface grid gap-3 rounded-xl border p-3.5", row?.is_hidden && "border-dashed")} aria-label={`Ticket type ${index + 1}`}>
      <div className="flex flex-wrap items-start gap-3">
        <FormField
          control={form.control}
          name={`ticket_types.${index}.name`}
          render={({ field: f }) => (
            <FormItem className="min-w-[180px] flex-1">
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} maxLength={80} placeholder={index === 0 ? DEFAULT_TYPE_NAME : "Student, VIP, Early bird…"} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`ticket_types.${index}.price`}
          render={({ field: f }) => (
            <FormItem className="w-[130px]">
              <FormLabel className="flex items-center gap-1.5">Price (₹)</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} type="number" min="0" step="any" inputMode="decimal" disabled={priceLocked && !(Number(f.value) > 0)} aria-label={`Price of ${name}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`ticket_types.${index}.capacity`}
          render={({ field: f }) => (
            <FormItem className="w-[130px]">
              <FormLabel>Places</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} type="number" min="0" step="1" inputMode="numeric" placeholder="No cap" aria-label={`Places of ${name}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-1 self-end pb-0.5">
          <IconButton label={`Move ${name} up`} variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUpIcon />
          </IconButton>
          <IconButton label={`Move ${name} down`} variant="ghost" size="sm" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDownIcon />
          </IconButton>
          <IconButton label={`Remove ${name}`} variant="ghost" size="sm" disabled={held || count <= 1} title={held ? "People hold these tickets: hide it instead" : undefined} onClick={onRemove}>
            <Trash2Icon />
          </IconButton>
        </div>
      </div>
      <FormField
        control={form.control}
        name={`ticket_types.${index}.description`}
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>Description (optional)</FormLabel>
            <FormControl>
              <Input {...f} value={f.value ?? ""} className={field} maxLength={500} placeholder="Who it is for, what it includes" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          control={form.control}
          name={`ticket_types.${index}.sales_start`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>On sale from</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} type="datetime-local" aria-label={`${name} on sale from`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`ticket_types.${index}.sales_end`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>Until</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} type="datetime-local" aria-label={`${name} on sale until`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`ticket_types.${index}.per_person_limit`}
          render={({ field: f }) => (
            <FormItem>
              <FormLabel>Per person</FormLabel>
              <FormControl>
                <Input {...f} value={f.value ?? ""} className={field} type="number" min="1" max="100" step="1" inputMode="numeric" placeholder="No limit" aria-label={`${name} per person`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FormField
          control={form.control}
          name={`ticket_types.${index}.is_hidden`}
          render={({ field: f }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Switch checked={Boolean(f.value)} onCheckedChange={f.onChange} aria-label={`Hide ${name}`} />
              </FormControl>
              <FormLabel className="text-ink-2 flex items-center gap-1.5 text-[12.5px] font-normal">
                <EyeOffIcon className="size-3.5" /> Hidden: sold only through a link that names it
              </FormLabel>
            </FormItem>
          )}
        />
        {row?.sold ? (
          <span className="text-ink-3 font-mono text-[11.5px] tabular-nums">
            {row.sold.toLocaleString("en-IN")} sold{held ? " · can be hidden, not removed" : ""}
          </span>
        ) : null}
      </div>
    </li>
  );
}

const dirty = { shouldDirty: true, shouldValidate: false } as const;

export function TicketTypesField({ eventId }: { eventId?: number }) {
  const form = useFormContext();
  const several = Boolean(useWatch({ control: form.control, name: "several_types" }));
  const drafts = useWatch({ control: form.control, name: "ticket_types" }) as TicketTypeDraft[] | undefined;
  const onServer = useTicketingOnServer(eventId === undefined);
  // Adding a type past the plan's cap opens the upgrade dialog instead.
  const addGate = useLimitGate("ticket_types_per_event", 1, { eventId });

  // Editing: the editor is there once the event's types loaded (EditEventForm). Making one: once the API has types.
  // (No field array is registered before then: it would turn "nothing to say about types" into an empty list.)
  const available = eventId !== undefined ? drafts !== undefined : onServer === true;
  if (!available) return null;

  const toSeveral = () => {
    if (addGate.locked) return addGate.prompt();
    const v = form.getValues();
    const first: TicketTypeDraft = {
      ...(drafts?.[0] ?? blankType()),
      name: drafts?.[0]?.name || DEFAULT_TYPE_NAME,
      price: v.has_fee ? Number(v.reg_fee) || 0 : 0,
      capacity: v.max_participants === "" || v.max_participants === undefined || v.max_participants === null ? undefined : Number(v.max_participants),
    };
    form.setValue("ticket_types", [first, ...(drafts ?? []).slice(1), ...((drafts?.length ?? 0) > 1 ? [] : [blankType()])], dirty);
    form.setValue("several_types", true, dirty);
    // The places were the one type's; now each type has its own, and the event's is a total.
    form.setValue("max_participants", "", dirty);
    form.setValue("has_fee", false, dirty);
    form.setValue("reg_fee", undefined, dirty);
  };

  if (several) return <TicketTypesList eventId={eventId} drafts={drafts ?? []} />;
  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3.5">
      <div className="flex items-start gap-3">
        <TicketIcon className="text-ink-3 mt-0.5 size-4" />
        <div>
          <p className="text-ink text-[13.5px] font-medium">One kind of ticket</p>
          <p className="text-ink-3 text-[12.5px]">At the fee and places above. Sell several types for students, early birds, VIPs or sponsors, each with its own price and places.</p>
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={toSeveral}>
        {addGate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Sell several ticket types
      </button>
    </div>
  );
}

/** The list, once the event sells several types. */
function TicketTypesList({ eventId, drafts }: { eventId?: number; drafts: TicketTypeDraft[] }) {
  const form = useFormContext();
  const { fields, append, move, remove } = useFieldArray({ control: form.control, name: "ticket_types" });
  const plan = useEventPlan(eventId);
  const priceLock = plan.featureLock("tickets");
  const addGate = useLimitGate("ticket_types_per_event", fields.length, { eventId });
  const typesError = (form.formState.errors as Record<string, { message?: string } | undefined>).ticket_types?.message;
  const othersHeld = drafts.slice(1).some((d) => d.has_registrations);
  const toOne = () => {
    const first = drafts[0] ?? { name: DEFAULT_TYPE_NAME, price: 0 };
    const price = Number(first.price) || 0;
    form.setValue("ticket_types", [first], dirty);
    form.setValue("several_types", false, dirty);
    form.setValue("has_fee", price > 0, dirty);
    form.setValue("reg_fee", price > 0 ? price : undefined, dirty);
    form.setValue("max_participants", first.capacity === "" || first.capacity === undefined || first.capacity === null ? "" : Number(first.capacity), dirty);
  };

  return (
    <div className="grid gap-3" role="group" aria-label="Ticket types">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-ink flex items-center gap-1.5 text-[13.5px] font-medium">
            Ticket types <LockBadge lock={priceLock} />
          </p>
          <p className="text-ink-3 text-[12.5px]">
            People choose one when they register. {addGate.cap !== null ? `Your plan allows ${addGate.cap} per event.` : ""}
            {drafts.length ? ` From ${priceText(Math.min(...drafts.map((d) => Number(d.price) || 0)))}.` : ""}
          </p>
        </div>
        {othersHeld ? null : (
          <button type="button" className="text-brand text-[12.5px] font-medium hover:underline" onClick={toOne}>
            Back to one kind of ticket
          </button>
        )}
      </div>
      <ol className="grid gap-2.5">
        {fields.map((f, index) => (
          <TypeRow key={f.id} index={index} count={fields.length} priceLocked={priceLock !== null} onMove={move} onRemove={() => remove(index)} />
        ))}
      </ol>
      {typesError ? (
        <p role="alert" className="text-refuse text-[12.5px]">
          {typesError}
        </p>
      ) : null}
      <div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addGate.locked ? addGate.prompt : () => append(blankType())}>
          {addGate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Add a ticket type
        </button>
      </div>
    </div>
  );
}
