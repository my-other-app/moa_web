"use client";

import * as React from "react";
import { Loader2Icon, Trash2Icon, UserPlusIcon } from "lucide-react";
import {
  Button,
  CardLabel,
  EmptyState,
  FigurePanel,
  IconButton,
  InitialsAvatar,
  Skeleton,
} from "@moa/ui";

import { useAddVolunteer, useRemoveVolunteer, useVolunteers } from "../queries";
import { addVolunteerSchema, type Volunteer } from "../schemas";

function emailOf(v: Volunteer): string {
  return v.email_id ?? v.email ?? "";
}

const blank = { full_name: "", email_id: "", phone: "" };

/**
 * Add one volunteer: a name, the email they sign in with, a phone if there
 * is one. Used on its own panel and in the Doors tab's dialog; `onAdded`
 * lets the caller refresh whatever else lists the team.
 */
export function AddVolunteerForm({
  eventId,
  onAdded,
  onCancel,
}: {
  eventId: number;
  onAdded?: () => void;
  onCancel?: () => void;
}) {
  const id = React.useId();
  const add = useAddVolunteer(eventId);
  const [draft, setDraft] = React.useState(blank);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set =
    (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = addVolunteerSchema.safeParse(draft);
    if (!parsed.success)
      return void setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]),
        ),
      );
    setErrors({});
    try {
      await add.mutateAsync(parsed.data);
      setDraft(blank);
      onAdded?.();
    } catch {
      /* the mutation says what went wrong */
    }
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <div>
        <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
          Name
        </label>
        <input
          id={`${id}-name`}
          className="input"
          placeholder="Asha K"
          value={draft.full_name}
          onChange={set("full_name")}
          aria-invalid={!!errors.full_name}
          maxLength={120}
        />
        {errors.full_name ? (
          <p className="text-refuse mt-1 text-[12px]">{errors.full_name}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="eyebrow mb-1.5 block">
          Email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          className="input"
          placeholder="asha@example.com"
          value={draft.email_id}
          onChange={set("email_id")}
          aria-invalid={!!errors.email_id}
        />
        {errors.email_id ? (
          <p className="text-refuse mt-1 text-[12px]">{errors.email_id}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${id}-phone`} className="eyebrow mb-1.5 block">
          Phone (optional)
        </label>
        <input
          id={`${id}-phone`}
          className="input"
          inputMode="tel"
          value={draft.phone}
          onChange={set("phone")}
          aria-invalid={!!errors.phone}
        />
        {errors.phone ? (
          <p className="text-refuse mt-1 text-[12px]">{errors.phone}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          {add.isPending ? "Adding…" : "Add volunteer"}
        </Button>
      </div>
    </form>
  );
}

/** The event's volunteers as a plain list beside the form that adds one. */
export function VolunteersPanel({ eventId }: { eventId: number }) {
  const { data, isPending, isError, refetch } = useVolunteers(eventId);
  const remove = useRemoveVolunteer(eventId);

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[1fr_340px]">
      <FigurePanel className="overflow-hidden p-0">
        <div className="px-4 pt-4">
          <CardLabel
            right={
              data?.length ? (
                <span className="text-ink-3 font-mono text-[11px]">
                  {data.length}
                </span>
              ) : null
            }
          >
            Volunteers
          </CardLabel>
          <p className="text-ink-3 mt-1 text-[12px]">
            They scan tickets and check guests in from the app or the gate.
          </p>
        </div>
        {isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            size="sm"
            title="Could not load the volunteers"
            description="Check the connection, then try again."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<UserPlusIcon />}
            title="No volunteers yet"
            description="Add someone so they can check guests in on the day."
          />
        ) : (
          <ul className="mt-2">
            {data.map((v) => {
              const name = v.full_name || v.name || "Unnamed";
              return (
                <li
                  key={emailOf(v) || v.id}
                  className="border-line-soft flex items-center gap-3 border-t px-4 py-2.5"
                >
                  <InitialsAvatar name={v.full_name ?? v.name ?? emailOf(v)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[13.5px] font-medium">
                      {name}
                    </span>
                    <span className="text-ink-3 block truncate text-[11.5px]">
                      {emailOf(v)}
                    </span>
                  </span>
                  <IconButton
                    label={`Remove ${v.full_name ?? emailOf(v)}`}
                    danger
                    disabled={remove.isPending || !emailOf(v)}
                    onClick={() => remove.mutate(emailOf(v))}
                  >
                    <Trash2Icon />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </FigurePanel>

      <FigurePanel className="p-4">
        <CardLabel>Add a volunteer</CardLabel>
        <p className="text-ink-3 mt-1 mb-3 text-[12px]">
          They get check-in access for this event.
        </p>
        <AddVolunteerForm eventId={eventId} />
      </FigurePanel>
    </div>
  );
}
