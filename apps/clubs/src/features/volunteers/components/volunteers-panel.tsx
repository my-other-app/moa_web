"use client";

import * as React from "react";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import {
  Button,
} from "@moa/ui";

import { useAddVolunteer } from "../queries";
import { addVolunteerSchema } from "../schemas";

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
