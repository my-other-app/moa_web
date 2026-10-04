"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCreateOrg, useUpdateOrg } from "../queries";
import { ORG_TYPES, orgFormSchema, type Org, type OrgFormInput } from "../schemas";

/**
 * Create or edit an organisation.
 *
 * One dialog for both, because the two payloads are identical and the only
 * difference is which mutation runs. Unlike the club and event handlers,
 * PUT /orgs/update applies only the fields it receives, so this is a genuine
 * partial update -- an empty optional field is omitted rather than sent
 * blank, which would otherwise overwrite a real value.
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

export function OrgFormDialog({
  org,
  trigger,
  open,
  onOpenChange,
}: {
  /** Omitted for a new organisation. */
  org?: Org;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [logo, setLogo] = React.useState<File | null>(null);
  const create = useCreateOrg();
  const update = useUpdateOrg(org?.id ?? -1);
  const mutation = org ? update : create;

  const form = useForm<OrgFormInput>({
    resolver: zodResolver(orgFormSchema),
    values: {
      name: org?.name ?? "",
      // `type` is required by the API; "other" is the honest default for a
      // new record rather than guessing a category.
      type: (org?.type as OrgFormInput["type"]) ?? "other",
      address: org?.address ?? "",
      phone: org?.phone ?? "",
      email: org?.email ?? "",
      website: org?.website ?? "",
    },
  });

  // useWatch rather than the form's watch(): that returns a fresh function
  // the React Compiler cannot memoize, so it bails out of optimising the
  // whole component.
  const type = useWatch({ control: form.control, name: "type" });

  const { errors } = form.formState;
  const isSaving = mutation.isPending || form.formState.isSubmitting;

  async function onSubmit(values: OrgFormInput) {
    await mutation.mutateAsync({ input: values, logo });
    setOpen(false);
    setLogo(null);
    if (!org) form.reset();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLogo(null);
      }}
    >
      {trigger ? <>{trigger}</> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {org ? `Edit ${org.name}` : "New organisation"}
          </DialogTitle>
          <DialogDescription>
            Organisations group clubs. Blocking one hides its clubs from the
            app.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field id="org-name" label="Name" error={errors.name?.message}>
            <Input
              id="org-name"
              maxLength={100}
              disabled={isSaving}
              aria-invalid={errors.name ? true : undefined}
              {...form.register("name")}
            />
          </Field>

          <Field id="org-type" label="Type" error={errors.type?.message}>
            <Select
              value={type}
              onValueChange={(next) =>
                form.setValue("type", next as OrgFormInput["type"], {
                  shouldDirty: true,
                })
              }
              disabled={isSaving}
            >
              <SelectTrigger id="org-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="org-address" label="Address" error={errors.address?.message}>
            <Input id="org-address" disabled={isSaving} {...form.register("address")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="org-email" label="Email" error={errors.email?.message}>
              <Input
                id="org-email"
                type="email"
                disabled={isSaving}
                aria-invalid={errors.email ? true : undefined}
                {...form.register("email")}
              />
            </Field>
            <Field id="org-phone" label="Phone" error={errors.phone?.message}>
              <Input
                id="org-phone"
                inputMode="tel"
                disabled={isSaving}
                {...form.register("phone")}
              />
            </Field>
          </div>

          <Field id="org-website" label="Website" error={errors.website?.message}>
            <Input id="org-website" disabled={isSaving} {...form.register("website")} />
          </Field>

          <Field id="org-logo" label="Logo">
            <Input
              id="org-logo"
              type="file"
              accept="image/*"
              disabled={isSaving}
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className={cn(pressable)}>
              {isSaving ? <Loader2Icon className="animate-spin" /> : null}
              {org ? "Save changes" : "Create organisation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
