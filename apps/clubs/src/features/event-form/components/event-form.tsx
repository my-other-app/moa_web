"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCreateEvent, useUpdateEvent } from "../queries";
import { eventFormSchema, type EventFormValues } from "../schemas";
import { STEPS } from "../steps";
import { BasicsStep } from "./steps/basics-step";
import { DetailsStep } from "./steps/details-step";
import { EntryStep } from "./steps/entry-step";
import { PlaceStep } from "./steps/place-step";
import { QuestionsStep } from "./steps/questions-step";
import { ScheduleStep } from "./steps/schedule-step";

const STEP_COMPONENTS: Record<string, React.ComponentType> = {
  basics: BasicsStep,
  schedule: ScheduleStep,
  place: PlaceStep,
  entry: EntryStep,
  details: DetailsStep,
  questions: QuestionsStep,
};

export const emptyEventForm: EventFormValues = {
  name: "",
  category_id: undefined as unknown as number,
  about: "",
  event_tag: "",
  interest_ids: [],
  event_datetime: "",
  duration: 1 as unknown as number,
  reg_startdate: "",
  reg_enddate: "",
  is_online: false,
  location_name: "",
  url: "",
  has_fee: false,
  has_prize: false,
  merch_enabled: false,
  swag_enabled: false,
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  event_guidelines: "",
  additional_details: [],
  speakers: [],
};

export function EventForm({
  mode,
  eventId,
  defaultValues,
}: {
  mode: "create" | "edit";
  eventId?: number;
  defaultValues?: EventFormValues;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [formError, setFormError] = React.useState<string | null>(null);

  const create = useCreateEvent();
  const update = useUpdateEvent(eventId ?? -1);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultValues ?? emptyEventForm,
    mode: "onTouched",
  });

  const step = STEPS[stepIndex]!;
  const StepComponent = STEP_COMPONENTS[step.id]!;
  const isLast = stepIndex === STEPS.length - 1;
  const isSaving = create.isPending || update.isPending || form.formState.isSubmitting;

  async function goNext() {
    // Validate only this step's fields so the organiser is not shown errors
    // for pages they have not reached yet.
    const valid = await form.trigger(step.fields as never, { shouldFocus: true });
    if (!valid) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  async function onSubmit(values: EventFormValues) {
    setFormError(null);
    const parsed = eventFormSchema.parse(values);
    try {
      const result =
        mode === "create"
          ? await create.mutateAsync(parsed)
          : await update.mutateAsync(parsed);
      router.push("/events");
      router.refresh();
      return result;
    } catch (error) {
      // Field-level errors from FastAPI are mapped back onto the form so the
      // organiser sees them next to the input rather than in a toast.
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          form.setError(field as never, { message: messages.join(", ") });
        }
      }
      setFormError(
        error instanceof ApiError ? error.message : "Could not save the event."
      );
      return undefined;
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-[220px_1fr]"
        noValidate
      >
        {/* Step rail. Horizontal and scrollable on small screens. */}
        <nav aria-label="Form steps" className="lg:sticky lg:top-20 lg:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {STEPS.map((s, i) => {
              const state = i === stepIndex ? "current" : i < stepIndex ? "done" : "todo";
              return (
                <li key={s.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setStepIndex(i)}
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
                      state === "current"
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] transition-colors",
                        state === "done" && "bg-primary border-primary text-primary-foreground",
                        state === "current" && "border-primary text-primary"
                      )}
                    >
                      {state === "done" ? <CheckIcon className="size-3" /> : i + 1}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* key remounts on step change so entry animations replay and
                  focus starts at the top of the new step. */}
              <div
                key={step.id}
                className="animate-in fade-in-0 slide-in-from-right-2 duration-300 motion-reduce:animate-none"
              >
                <StepComponent />
              </div>
            </CardContent>
          </Card>

          {formError ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive animate-in fade-in-0 rounded-md px-3 py-2 text-sm motion-reduce:animate-none"
            >
              {formError}
            </p>
          ) : null}

          <div className="bg-background/80 sticky bottom-0 flex items-center gap-3 border-t py-3 backdrop-blur-sm">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
              disabled={stepIndex === 0 || isSaving}
              className={pressable}
            >
              <ArrowLeftIcon /> Back
            </Button>

            <span className="text-muted-foreground text-xs tabular-nums">
              Step {stepIndex + 1} of {STEPS.length}
            </span>

            <div className="flex-1" />

            {isLast ? (
              <Button type="submit" disabled={isSaving} className={cn("group", pressable)}>
                {isSaving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                {isSaving
                  ? "Saving…"
                  : mode === "create"
                    ? "Publish event"
                    : "Save changes"}
              </Button>
            ) : (
              <Button type="button" onClick={goNext} className={cn("group", pressable)}>
                Next
                <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
