"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { SectionTitle, pickImage } from "@moa/app-kit";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  cn,
} from "@moa/ui";
import { enter, pressable } from "@moa/ui/motion";

import { useMyClub, useOrganizations, useUpdateMyClub } from "../queries";
import { clubProfileFormSchema, type ClubProfileForm as Values } from "../schemas";
import { InterestPicker } from "./interest-picker";
import { LogoUpload } from "./logo-upload";

/**
 * Edit club profile from the design (node 368:282): three sections -- basic
 * information with the logo control on the right, links to connect, and the
 * focus-area picker -- with a single right-aligned CTA.
 *
 * Built on plain `register` rather than the shared Form primitives: the design
 * labels every field at 12px above a 44px input with no helper row, which is
 * the `design` input variant plus a Label. Routing that through FormItem /
 * FormLabel would mean overriding each one back to the same thing.
 */
const NO_ORG = "__none__";

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-normal text-[var(--swatch-ink)]">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-12">
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-6">
          <Skeleton className="h-6 w-48" />
          <div className="flex flex-wrap gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[66px] w-[360px]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClubProfileForm() {
  const router = useRouter();
  const { data: club, isPending } = useMyClub();
  const { data: orgs } = useOrganizations();
  const update = useUpdateMyClub();

  const form = useForm<Values>({
    resolver: zodResolver(clubProfileFormSchema),
    // `values`, not `defaultValues`: defaults are captured once and would leave
    // every field blank on first paint, before the query resolves.
    values: club
      ? {
          name: club.name ?? "",
          about: club.about ?? "",
          org_id: club.org?.id ?? null,
          location_name: club.location_name ?? "",
          location_link: club.location_link ?? "",
          contact_email: club.contact_email ?? "",
          contact_phone: club.contact_phone ?? "",
          brand_primary: club.brand_primary ?? "",
          brand_secondary: club.brand_secondary ?? "",
          instagram: club.socials?.instagram ?? "",
          youtube: club.socials?.youtube ?? "",
          linkedin: club.socials?.linkedin ?? "",
          website: club.socials?.website ?? "",
          interest_ids: club.interests.map((i) => i.id),
        }
      : undefined,
  });

  /*
   * `useWatch` rather than `form.watch`: watch() returns a fresh function the
   * React Compiler cannot memoize, so it bails out of optimising the whole
   * component. These are hooks, so they also have to sit above the early
   * return for the loading state.
   */
  const control = form.control;
  const orgId = useWatch({ control, name: "org_id" });
  const interestIds = useWatch({ control, name: "interest_ids" }) ?? [];
  const about = useWatch({ control, name: "about" });
  const brandPrimary = useWatch({ control, name: "brand_primary" });
  const brandSecondary = useWatch({ control, name: "brand_secondary" });

  if (isPending) return <FormSkeleton />;

  const { errors } = form.formState;
  const isSaving = update.isPending || form.formState.isSubmitting;
  const logo = pickImage(club?.logo, ["medium", "thumbnail", "large", "original"]);

  async function onSubmit(values: Values) {
    await update.mutateAsync(values);
    router.push("/profile");
  }

  const linkFields: ReadonlyArray<{
    name: Extract<FieldPath<Values>, "instagram" | "youtube" | "linkedin" | "website">;
    label: string;
    placeholder: string;
  }> = [
    { name: "instagram", label: "Instagram Link", placeholder: "https://instagram.com/…" },
    { name: "youtube", label: "Youtube Link", placeholder: "https://youtube.com/…" },
    { name: "linkedin", label: "Linkedin Link", placeholder: "https://linkedin.com/…" },
    { name: "website", label: "Website Link", placeholder: "https://…" },
  ];

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-[60px]", enter)}
      noValidate
    >
      {/* Basic information */}
      <section className="flex flex-col gap-6">
        <SectionTitle>Basic Information</SectionTitle>

        <div className="flex flex-col gap-[72px] xl:flex-row xl:items-start">
          <div className="flex flex-col gap-[72px] lg:flex-row lg:items-start">
            <div className="flex w-full flex-col gap-6 lg:w-[360px]">
              <Field id="club-name" label="Club Name" error={errors.name?.message}>
                <Input
                  id="club-name"
                  variant="design"
                  placeholder="Enter Club Name"
                  maxLength={20}
                  disabled={isSaving}
                  aria-invalid={errors.name ? true : undefined}
                  {...form.register("name")}
                />
              </Field>

              <Field
                id="club-org"
                label="Club Organization"
                error={errors.org_id?.message}
              >
                <Select
                  value={orgId == null ? NO_ORG : String(orgId)}
                  onValueChange={(next) =>
                    form.setValue("org_id", next === NO_ORG ? null : Number(next), {
                      shouldDirty: true,
                    })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger id="club-org" variant="design">
                    <SelectValue placeholder="Choose Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORG}>No organization</SelectItem>
                    {(orgs ?? []).map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                id="club-location"
                label="Club Location"
                error={errors.location_name?.message}
              >
                <Input
                  id="club-location"
                  variant="design"
                  placeholder="Choose Club Location"
                  disabled={isSaving}
                  {...form.register("location_name")}
                />
              </Field>

              {/*
               * Not in the design, kept deliberately: the endpoint overwrites
               * both contacts with whatever it receives, so a screen without
               * them would wipe the details students use to reach the club the
               * first time anyone saved their profile.
               */}
              <Field
                id="club-email"
                label="Contact Email"
                error={errors.contact_email?.message}
              >
                <Input
                  id="club-email"
                  variant="design"
                  type="email"
                  placeholder="club@example.com"
                  disabled={isSaving}
                  aria-invalid={errors.contact_email ? true : undefined}
                  {...form.register("contact_email")}
                />
              </Field>

              <Field
                id="club-phone"
                label="Contact Phone"
                error={errors.contact_phone?.message}
              >
                <Input
                  id="club-phone"
                  variant="design"
                  inputMode="tel"
                  placeholder="9000000000"
                  disabled={isSaving}
                  aria-invalid={errors.contact_phone ? true : undefined}
                  {...form.register("contact_phone")}
                />
              </Field>

              {/* Brand colours: what a ticket, card, certificate, programme or email
                  takes when its own design names none. Hex, like a design tool. */}
              <Field id="club-brand-primary" label="Brand colour" error={errors.brand_primary?.message}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Pick the brand colour" value={/^#[0-9a-fA-F]{6}$/.test(brandPrimary ?? "") ? brandPrimary : "#1db9a0"} onChange={(e) => form.setValue("brand_primary", e.target.value, { shouldDirty: true })} disabled={isSaving} className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
                  <Input id="club-brand-primary" variant="design" placeholder="#1db9a0" disabled={isSaving} aria-invalid={errors.brand_primary ? true : undefined} {...form.register("brand_primary")} />
                </div>
              </Field>

              <Field id="club-brand-secondary" label="Second colour" error={errors.brand_secondary?.message}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Pick the second colour" value={/^#[0-9a-fA-F]{6}$/.test(brandSecondary ?? "") ? brandSecondary : "#aaaaaa"} onChange={(e) => form.setValue("brand_secondary", e.target.value, { shouldDirty: true })} disabled={isSaving} className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
                  <Input id="club-brand-secondary" variant="design" placeholder="#aaaaaa" disabled={isSaving} aria-invalid={errors.brand_secondary ? true : undefined} {...form.register("brand_secondary")} />
                </div>
              </Field>
            </div>

            <Field
              id="club-about"
              label="Club Description"
              error={errors.about?.message}
              className="lg:w-[360px]"
            >
              <Textarea
                id="club-about"
                variant="design"
                rows={8}
                placeholder="Enter Club Description"
                maxLength={2000}
                disabled={isSaving}
                className="min-h-[196px]"
                {...form.register("about")}
              />
              <p className="text-right text-xs text-[var(--swatch-grey)]">
                {(about?.length ?? 0).toLocaleString("en-IN")} / 2,000
              </p>
            </Field>
          </div>

          <LogoUpload currentLogo={logo} />
        </div>
      </section>

      {/* Links */}
      <section className="flex flex-col gap-6">
        <SectionTitle>Links to connect</SectionTitle>
        <div className="flex flex-wrap gap-6">
          {linkFields.map((field) => (
            <Field
              key={field.name}
              id={`club-${field.name}`}
              label={field.label}
              error={errors[field.name]?.message}
              className="lg:w-[360px]"
            >
              <Input
                id={`club-${field.name}`}
                variant="design"
                type="url"
                inputMode="url"
                placeholder={field.placeholder}
                disabled={isSaving}
                aria-invalid={errors[field.name] ? true : undefined}
                {...form.register(field.name)}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* Focus areas */}
      <section className="flex flex-col gap-6">
        <SectionTitle>Select Areas Related to the Club</SectionTitle>
        <InterestPicker
          value={interestIds}
          onChange={(next) =>
            form.setValue("interest_ids", next, { shouldDirty: true })
          }
          disabled={isSaving}
        />
      </section>

      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" asChild disabled={isSaving}>
          <Link href="/profile">Cancel</Link>
        </Button>
        <Button
          type="submit"
          variant="display"
          size="display"
          disabled={isSaving}
          className={cn("w-full sm:w-[240px]", pressable)}
        >
          {isSaving ? <Loader2Icon className="size-5 animate-spin" /> : null}
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
