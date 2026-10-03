"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, SaveIcon } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useUpdateClub } from "../queries";
import { clubEditSchema, type AdminClubDetail, type ClubEditInput } from "../schemas";

/**
 * Admin edit for any club.
 *
 * Every field the endpoint touches is present, including `org_id` and
 * `interest_ids`. The handler assigns each column from the request and
 * deletes the interest links before re-adding the ids it was sent, so a
 * partial payload does not leave the rest alone -- it clears them. The two
 * fields with no control here are seeded from the club and sent back
 * unchanged for exactly that reason.
 */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function ClubEditForm({ club }: { club: AdminClubDetail }) {
  const update = useUpdateClub(club.id);

  const form = useForm<ClubEditInput>({
    resolver: zodResolver(clubEditSchema),
    values: {
      name: club.name,
      about: club.about ?? "",
      location_name: club.location_name ?? "",
      location_link: club.location_link ?? "",
      contact_email: club.contact_email ?? "",
      contact_phone: club.contact_phone ?? "",
      instagram: club.socials?.instagram ?? "",
      youtube: club.socials?.youtube ?? "",
      linkedin: club.socials?.linkedin ?? "",
      website: club.socials?.website ?? "",
      // No controls for these, but they must round-trip or saving wipes them.
      org_id: club.org?.id ?? null,
      interest_ids: club.interests.map((i) => i.id),
    },
  });

  const { errors } = form.formState;
  const isSaving = update.isPending || form.formState.isSubmitting;

  return (
    <form
      onSubmit={form.handleSubmit((values) => update.mutate(values))}
      className="max-w-3xl space-y-6 pt-2"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="club-name" label="Club name" error={errors.name?.message}>
          <Input
            id="club-name"
            maxLength={20}
            disabled={isSaving}
            aria-invalid={errors.name ? true : undefined}
            {...form.register("name")}
          />
        </Field>

        <Field id="club-location" label="Location" error={errors.location_name?.message}>
          <Input id="club-location" disabled={isSaving} {...form.register("location_name")} />
        </Field>

        <div className="sm:col-span-2">
          <Field id="club-about" label="About" error={errors.about?.message}>
            <Textarea
              id="club-about"
              rows={5}
              maxLength={2000}
              disabled={isSaving}
              {...form.register("about")}
            />
          </Field>
        </div>

        <Field id="club-email" label="Contact email" error={errors.contact_email?.message}>
          <Input
            id="club-email"
            type="email"
            disabled={isSaving}
            aria-invalid={errors.contact_email ? true : undefined}
            {...form.register("contact_email")}
          />
        </Field>

        <Field id="club-phone" label="Contact phone" error={errors.contact_phone?.message}>
          <Input id="club-phone" inputMode="tel" disabled={isSaving} {...form.register("contact_phone")} />
        </Field>

        {(["instagram", "youtube", "linkedin", "website"] as const).map((key) => (
          <Field
            key={key}
            id={`club-${key}`}
            label={key[0]!.toUpperCase() + key.slice(1)}
            error={errors[key]?.message}
          >
            <Input
              id={`club-${key}`}
              type="url"
              inputMode="url"
              placeholder="https://"
              disabled={isSaving}
              aria-invalid={errors[key] ? true : undefined}
              {...form.register(key)}
            />
          </Field>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        {form.formState.isDirty ? (
          <p className="text-muted-foreground mr-auto text-xs">Unsaved changes</p>
        ) : null}
        <Button
          type="submit"
          disabled={isSaving || !form.formState.isDirty}
          className={cn(pressable)}
        >
          {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
