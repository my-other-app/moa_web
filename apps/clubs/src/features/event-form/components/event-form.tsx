"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import { Form, cn } from "@moa/ui";

import { useCreateEvent, useUpdateEvent } from "../queries";
import { eventFormSchema, type EventFormValues } from "../schemas";
import { STEPS } from "../steps";
import { BasicsStep } from "./steps/basics-step";
import { DetailsStep } from "./steps/details-step";
import { EntryStep } from "./steps/entry-step";
import { PlaceStep } from "./steps/place-step";
import { QuestionsStep } from "./steps/questions-step";
import { ScheduleStep } from "./steps/schedule-step";

/**
 * One page, every detail. The sections run down the page in the order of
 * STEPS — what it is, when, where, entry, details, questions — with a
 * rail of links on the left to jump between them and one Save at the end.
 * Validation runs on save; a section with a problem is scrolled to.
 */
const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
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

export function EventForm({ mode, eventId, defaultValues }: { mode: "create" | "edit"; eventId?: number; defaultValues?: EventFormValues }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const create = useCreateEvent();
  const update = useUpdateEvent(eventId ?? -1);
  const form = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: defaultValues ?? emptyEventForm, mode: "onTouched" });
  const isSaving = create.isPending || update.isPending || form.formState.isSubmitting;
  const { errors, isDirty } = form.formState;

  // The first section with a problem, so the save button can point at it.
  const brokenSection = STEPS.find((s) => s.fields.some((f) => f in errors));

  async function onSubmit(values: EventFormValues) {
    setFormError(null);
    const parsed = eventFormSchema.parse(values);
    try {
      const result = mode === "create" ? await create.mutateAsync(parsed) : await update.mutateAsync(parsed);
      router.push("/events");
      router.refresh();
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          form.setError(field as never, { message: messages.join(", ") });
        }
      }
      setFormError(error instanceof ApiError ? error.message : "Could not save the event.");
      return undefined;
    }
  }

  const onInvalid = () => {
    const first = STEPS.find((s) => s.fields.some((f) => f in form.formState.errors));
    if (first) document.getElementById(`section-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate className="flex flex-col gap-3.5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">{mode === "create" ? "New event" : "Edit event"}</h2>
            <p className="text-ink-2 mt-1 text-[13px]">{mode === "create" ? "Everything on one page. Publish when it reads right; you can edit all of it afterwards." : "Changes are live as soon as you save."}</p>
          </div>
          <SaveButton mode={mode} saving={isSaving} dirty={mode === "create" || isDirty} />
        </header>

        <div className="grid gap-3.5 lg:grid-cols-[180px_1fr]">
          <nav aria-label="Sections" className="lg:sticky lg:top-2 lg:self-start">
            <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {STEPS.map((s) => {
                const broken = s.fields.some((f) => f in errors);
                return (
                  <li key={s.id} className="shrink-0">
                    <a href={`#section-${s.id}`} className={cn("hover:bg-sunken text-ink-2 hover:text-ink block rounded-[10px] px-3 py-1.5 text-[13px] transition-colors", broken && "text-refuse")}>
                      {s.title}
                      {broken ? " · fix" : ""}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="flex min-w-0 flex-col gap-3.5">
            {STEPS.map((s) => {
              const Section = SECTION_COMPONENTS[s.id]!;
              return (
                <section key={s.id} id={`section-${s.id}`} aria-labelledby={`section-${s.id}-title`} className="bg-surface shadow-card border-line-soft scroll-mt-4 rounded-2xl border p-5">
                  <div className="mb-4">
                    <h3 id={`section-${s.id}-title`} className="text-ink m-0 text-[15px] font-semibold">
                      {s.title}
                    </h3>
                    <p className="text-ink-3 mt-0.5 text-[12.5px]">{s.description}</p>
                  </div>
                  <Section />
                </section>
              );
            })}

            {formError ? (
              <p role="alert" className="bg-refuse-soft text-refuse rounded-xl px-3 py-2 text-[13px]">
                {formError}
              </p>
            ) : null}

            <div className="bg-surface/90 border-line-soft sticky bottom-0 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-sm">
              <span className="text-ink-3 text-[12.5px]">{brokenSection ? `Something to fix under ${brokenSection.title}.` : mode === "create" ? "Publishes to your club page and your followers' feeds." : "Every section saves together."}</span>
              <div className="flex-1" />
              <SaveButton mode={mode} saving={isSaving} dirty={mode === "create" || isDirty} />
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}

function SaveButton({ mode, saving, dirty }: { mode: "create" | "edit"; saving: boolean; dirty: boolean }) {
  return (
    <button type="submit" className={cn("btn h-9", dirty ? "btn-primary" : "btn-secondary")} disabled={saving || !dirty}>
      {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
      {saving ? "Saving…" : mode === "create" ? "Publish event" : dirty ? "Save changes" : "All changes saved"}
    </button>
  );
}
