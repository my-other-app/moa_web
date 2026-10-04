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
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCreateBadge, useUpdateBadge } from "../queries";
import {
  BADGE_TYPES,
  CLUB_METRICS,
  USER_METRICS,
  badgeFormSchema,
  type Badge,
  type BadgeFormInput,
} from "../schemas";

/** Reads as prose rather than a column name. */
function metricLabel(metric: string): string {
  return metric.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function BadgeFormDialog({
  badge,
  trigger,
  open,
  onOpenChange,
}: {
  /** Omitted for a new badge. */
  badge?: Badge;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const create = useCreateBadge();
  const update = useUpdateBadge(badge?.id ?? -1);
  const mutation = badge ? update : create;
  const isEdit = Boolean(badge);

  const form = useForm<BadgeFormInput>({
    resolver: zodResolver(badgeFormSchema),
    values: {
      slug: badge?.slug ?? "",
      name: badge?.name ?? "",
      description: badge?.description ?? "",
      emoji: badge?.emoji ?? "",
      badge_type: (badge?.badge_type as BadgeFormInput["badge_type"]) ?? "user",
      trigger_metric: badge?.trigger_metric ?? "events_attended",
      threshold: badge?.threshold ?? 1,
    },
  });

  // useWatch rather than the form's watch(): that returns a fresh function
  // the React Compiler cannot memoize, so it bails out of the whole component.
  const badgeType = useWatch({ control: form.control, name: "badge_type" });
  const triggerMetric = useWatch({ control: form.control, name: "trigger_metric" });

  const metrics = badgeType === "club" ? CLUB_METRICS : USER_METRICS;
  const { errors } = form.formState;
  const isSaving = mutation.isPending || form.formState.isSubmitting;

  async function onSubmit(values: BadgeFormInput) {
    await mutation.mutateAsync(values);
    setOpen(false);
    if (!isEdit) form.reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <>{trigger}</> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{badge ? `Edit ${badge.name}` : "New badge"}</DialogTitle>
          <DialogDescription>
            Badges are awarded automatically when a holder&rsquo;s metric
            reaches the threshold, and can also be given by hand from the
            badge&rsquo;s page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_5rem]">
            <Field id="badge-name" label="Name" error={errors.name?.message}>
              <Input
                id="badge-name"
                disabled={isSaving}
                aria-invalid={errors.name ? true : undefined}
                {...form.register("name")}
              />
            </Field>
            <Field id="badge-emoji" label="Emoji" error={errors.emoji?.message}>
              <Input
                id="badge-emoji"
                disabled={isSaving}
                aria-invalid={errors.emoji ? true : undefined}
                {...form.register("emoji")}
              />
            </Field>
          </div>

          <Field
            id="badge-slug"
            label="Slug"
            hint={
              isEdit
                ? "Fixed after creation — changing it would orphan anything referencing it."
                : "Lower-case letters, numbers and hyphens."
            }
            error={errors.slug?.message}
          >
            <Input
              id="badge-slug"
              disabled={isSaving || isEdit}
              aria-invalid={errors.slug ? true : undefined}
              {...form.register("slug")}
            />
          </Field>

          <Field
            id="badge-description"
            label="Description"
            error={errors.description?.message}
          >
            <Textarea
              id="badge-description"
              rows={2}
              maxLength={255}
              disabled={isSaving}
              aria-invalid={errors.description ? true : undefined}
              {...form.register("description")}
            />
          </Field>

          <Field
            id="badge-type"
            label="Awarded to"
            hint={
              isEdit
                ? "Fixed after creation — the update endpoint does not accept it."
                : undefined
            }
          >
            <Select
              value={badgeType}
              onValueChange={(next) => {
                form.setValue("badge_type", next as BadgeFormInput["badge_type"], {
                  shouldDirty: true,
                });
                // The metric lists do not overlap, so a type change would
                // otherwise leave a trigger the checker never computes.
                form.setValue(
                  "trigger_metric",
                  next === "club" ? CLUB_METRICS[0] : USER_METRICS[0],
                  { shouldDirty: true }
                );
              }}
              disabled={isSaving || isEdit}
            >
              <SelectTrigger id="badge-type" className="w-full capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BADGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type === "user" ? "Users" : "Clubs"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field
              id="badge-metric"
              label="Trigger metric"
              error={errors.trigger_metric?.message}
            >
              <Select
                value={triggerMetric}
                onValueChange={(next) =>
                  form.setValue("trigger_metric", next, { shouldDirty: true })
                }
                disabled={isSaving}
              >
                <SelectTrigger id="badge-metric" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metrics.map((metric) => (
                    <SelectItem key={metric} value={metric}>
                      {metricLabel(metric)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="badge-threshold"
              label="Threshold"
              error={errors.threshold?.message}
            >
              <Input
                id="badge-threshold"
                type="number"
                min={0}
                step="any"
                disabled={isSaving}
                aria-invalid={errors.threshold ? true : undefined}
                {...form.register("threshold")}
              />
            </Field>
          </div>

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
              {badge ? "Save changes" : "Create badge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
