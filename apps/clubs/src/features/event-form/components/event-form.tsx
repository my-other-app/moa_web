"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CircleIcon, Loader2Icon, MapPinIcon, SaveIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { useObjectUrl } from "@moa/ui/hooks";
import { Form, InlineAlert, Notice, ProgressBar, cn } from "@moa/ui";

import { useMyClub } from "@/features/club";
import { LimitMeter, isPlanLockError, lockCopy, useLimitGate } from "@/features/plan";

import { useCreateEvent, usePublishEvent, useUpdateEvent } from "../queries";
import { readiness, spanLabel } from "../readiness";
import { eventFormSchema, type EventFormValues } from "../schemas";
import { STEPS } from "../steps";
import { EntryStep } from "./steps/entry-step";
import { EventStep } from "./steps/event-step";
import { PeopleStep } from "./steps/people-step";
import { QuestionsStep } from "./steps/questions-step";
import { ReachStep } from "./steps/reach-step";
import { WhenStep } from "./steps/when-step";
import { WhereStep } from "./steps/where-step";

/**
 * The event form, in two columns.
 *
 * The left is the form, seven sections in the order things get decided.
 * The right stays put: how ready the event is (the four things publishing
 * needs, the six that make a page people sign up from), each a link to its
 * section; the card as people will see it; and, while editing, who is
 * already in. Two ways out: save a draft, or publish.
 */
export interface EventFormContext {
  /** The poster already on the event, while editing. */
  posterUrl?: string | null;
  status?: "draft" | "published" | "live" | "closed" | "archived";
  registered?: number;
}

export const emptyEventForm: EventFormValues = {
  name: "",
  category_id: undefined as unknown as number,
  about: "",
  event_tag: "",
  interest_ids: [],
  event_datetime: "",
  duration: 2 as unknown as number,
  reg_startdate: "",
  reg_enddate: "",
  is_online: false,
  location_name: "",
  location_link: "",
  lat: null,
  lng: null,
  geo_source: null,
  clear_point: false,
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

function Preview({ values, posterUrl, clubName }: { values: EventFormValues; posterUrl?: string | null; clubName: string }) {
  const preview = useObjectUrl(values.posterFile) ?? posterUrl ?? null;
  const d = values.event_datetime ? new Date(values.event_datetime) : null;
  const valid = d && !Number.isNaN(d.getTime());
  const place = values.is_online ? "Online" : values.location_name?.trim() || "Venue to come";
  const line = (values.about ?? "").trim().split("\n")[0] ?? "";
  return (
    <div className="bg-surface border-line-soft shadow-card overflow-hidden rounded-[var(--radius-card)] border">
      <div className="bg-sunken relative aspect-[16/9]">
        {preview ? <Image src={preview} alt="" fill sizes="320px" className="object-cover" unoptimized /> : null}
        {values.event_tag?.trim() ? <span className="bg-surface text-ink absolute top-2 left-2 rounded-md px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase">{values.event_tag.trim()}</span> : null}
        <span className="bg-surface absolute right-2 bottom-2 grid min-w-[44px] place-items-center rounded-lg px-1.5 py-1 text-center leading-none">
          <span className="text-ink font-mono text-[16px] font-semibold tabular-nums">{valid ? d.toLocaleDateString("en-IN", { day: "2-digit" }) : "—"}</span>
          <span className="text-ink-3 font-mono text-[9px] tracking-[0.08em] uppercase">{valid ? d.toLocaleDateString("en-IN", { month: "short" }) : "tbd"}</span>
        </span>
      </div>
      <div className="p-3">
        <p className="text-ink truncate text-[14px] font-semibold">{values.name?.trim() || "Event name"}</p>
        <p className="text-ink-3 text-[11.5px]">{clubName}</p>
        <p className="text-ink-2 mt-1.5 text-[12px]">{valid ? spanLabel(values.event_datetime, values.duration) : "Day and time to come"}</p>
        <p className="text-ink-2 flex items-center gap-1 text-[12px]">
          <MapPinIcon className="size-3" /> {place} · {values.has_fee && values.reg_fee ? `₹${values.reg_fee}` : "Free"}
          {values.max_participants ? ` · ${values.max_participants} places` : ""}
        </p>
        {line ? <p className="text-ink-3 mt-1.5 line-clamp-2 text-[12px]">{line}</p> : null}
      </div>
    </div>
  );
}

function Item({ label, done, section, broken }: { label: string; done: boolean; section: string; broken: boolean }) {
  return (
    <li>
      <a href={`#section-${section}`} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] transition-colors", done ? "text-ink-3" : "text-ink hover:bg-sunken", broken && !done && "text-refuse")}>
        {done ? <CheckIcon className="text-admit size-3.5 shrink-0" /> : <CircleIcon className="size-3.5 shrink-0" />}
        <span className={cn(done && "line-through decoration-[var(--line)]")}>{label}</span>
      </a>
    </li>
  );
}

function ReadinessRail({ values, errors }: { values: EventFormValues; errors: Record<string, unknown> }) {
  const r = readiness(values);
  const brokenIds = new Set(STEPS.filter((s) => s.fields.some((f) => f in errors)).map((s) => s.id));
  return (
    <div className="bg-surface border-line-soft shadow-card rounded-[var(--radius-card)] border p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{r.publishable ? "Ready to publish" : "Before publishing"}</span>
        <span className="text-ink-3 font-mono text-[11px] tabular-nums">{r.score}%</span>
      </div>
      <ProgressBar value={r.score} max={100} tone={r.publishable ? "admit" : "accent"} className="mt-2" />
      <ul className="mt-3 grid gap-0.5">
        {r.required.map((i) => (
          <Item key={i.key} label={i.label} done={i.done} section={i.section} broken={brokenIds.has(i.section)} />
        ))}
      </ul>
      <p className="eyebrow mt-3">Makes a better page</p>
      <ul className="mt-1.5 grid gap-0.5">
        {r.recommended.map((i) => (
          <Item key={i.key} label={i.label} done={i.done} section={i.section} broken={brokenIds.has(i.section)} />
        ))}
      </ul>
    </div>
  );
}

interface ActionsProps {
  mode: "create" | "edit";
  isSaving: boolean;
  intent: "draft" | "published";
  canDraft: boolean;
  publishable: boolean;
  isDirty: boolean;
  isDraft: boolean;
  publishing: boolean;
  submitAs: (as: "draft" | "published") => void;
  onPublish: () => void;
}

/** Two ways out of a new event; one out of an edit, plus Publish while it is a draft. */
function Actions({ mode, isSaving, intent, canDraft, publishable, isDirty, isDraft, publishing, submitAs, onPublish }: ActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === "create" ? (
        <>
          <button type="button" className="btn btn-secondary" disabled={isSaving || !canDraft} onClick={() => submitAs("draft")}>
            {isSaving && intent === "draft" ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />} Save as draft
          </button>
          <button type="button" className="btn btn-primary" disabled={isSaving || !publishable} title={publishable ? undefined : "Fill the four things on the right first"} onClick={() => submitAs("published")}>
            {isSaving && intent === "published" ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />} Publish
          </button>
        </>
      ) : (
        <>
          <button type="button" className={cn("btn btn-secondary", isDirty ? "btn-primary" : "btn-secondary")} disabled={isSaving || !isDirty} onClick={() => submitAs("published")}>
            {isSaving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />} {isSaving ? "Saving…" : isDirty ? "Save changes" : "All changes saved"}
          </button>
          {isDraft ? (
            <button type="button" className="btn btn-primary" disabled={publishing || isDirty || !publishable} title={isDirty ? "Save your changes first" : undefined} onClick={onPublish}>
              {publishing ? <Loader2Icon className="size-4 animate-spin" /> : null} Publish
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function EventForm({ mode, eventId, defaultValues, context }: { mode: "create" | "edit"; eventId?: number; defaultValues?: EventFormValues; context?: EventFormContext }) {
  const router = useRouter();
  const club = useMyClub();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [intent, setIntent] = React.useState<"draft" | "published">("published");
  const create = useCreateEvent();
  const update = useUpdateEvent(eventId ?? -1);
  const publish = usePublishEvent(eventId ?? -1);
  const form = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: defaultValues ?? emptyEventForm, mode: "onTouched" });
  // useWatch, not form.watch(): the compiler cannot memoise the latter.
  const values = useWatch({ control: form.control }) as EventFormValues;
  const { errors, isDirty } = form.formState;
  const isSaving = create.isPending || update.isPending || form.formState.isSubmitting;
  const ready = readiness(values);
  const isDraft = mode === "edit" && context?.status === "draft";
  // A new event counts against the month's events; at the cap, saving opens the upgrade dialog instead.
  const monthly = useLimitGate("events_per_month");
  const capped = mode === "create" && monthly.locked;
  const cappedCopy = capped && monthly.lock ? lockCopy(monthly.lock) : null;

  // The contact comes from the club; an organiser only types it when someone else is running this one.
  React.useEffect(() => {
    const c = club.data;
    if (mode !== "create" || !c) return;
    const cur = form.getValues();
    if (!cur.contact_phone && !cur.contact_email && !cur.contact_name) {
      form.reset({ ...cur, contact_name: c.name ?? "", contact_phone: c.contact_phone ?? "", contact_email: c.contact_email ?? "" }, { keepDirty: false });
    }
  }, [club.data, form, mode]);

  async function onSubmit(raw: EventFormValues) {
    setFormError(null);
    const parsed = eventFormSchema.parse(raw);
    try {
      if (mode === "create") {
        const made = await create.mutateAsync({ values: parsed, status: intent });
        router.push(intent === "draft" ? "/events?scope=draft" : `/events/${made.id}`);
      } else {
        await update.mutateAsync(parsed);
        router.push(`/events/${eventId}`);
      }
      router.refresh();
    } catch (error) {
      // The plan said no: the upgrade dialog has it, and its `errors` are not field errors.
      if (isPlanLockError(error)) return;
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) form.setError(field as never, { message: messages.join(", ") });
      }
      setFormError(error instanceof ApiError ? error.message : "Could not save the event.");
    }
  }

  const onInvalid = () => {
    const first = STEPS.find((s) => s.fields.some((f) => f in form.formState.errors));
    if (first) document.getElementById(`section-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitAs = (as: "draft" | "published") => {
    if (capped) return monthly.prompt();
    setIntent(as);
    void form.handleSubmit(onSubmit, onInvalid)();
  };

  const actionProps: ActionsProps = { mode, isSaving, intent, canDraft: Boolean(values.name?.trim()), publishable: ready.publishable, isDirty, isDraft, publishing: publish.isPending, submitAs, onPublish: () => publish.mutate(undefined, { onSuccess: () => router.push(`/events/${eventId}`) }) };

  const sections: Record<string, React.ReactNode> = {
    event: <EventStep posterUrl={context?.posterUrl} />,
    when: <WhenStep />,
    where: <WhereStep />,
    entry: <EntryStep eventId={mode === "edit" ? eventId : undefined} />,
    people: <PeopleStep />,
    reach: <ReachStep />,
    questions: <QuestionsStep />,
  };

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="grid gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">{mode === "create" ? "New event" : values.name?.trim() || "Edit event"}</h1>
            <p className="text-ink-3 mt-1 text-[12.5px]">
              {mode === "create" ? "Four things make it publishable; the rest makes it a page people sign up from. Save a draft any time." : isDraft ? "A draft. Nobody sees it until you publish." : context?.status === "published" || context?.status === "live" ? "Live. Changes show the moment you save." : "Changes show the moment you save."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "create" ? <LimitMeter limitKey="events_per_month" /> : null}
            <Actions {...actionProps} />
          </div>
        </header>

        {cappedCopy ? (
          <Notice
            tone="caution"
            tag="Plan"
            action={
              <Link href="/billing" className="btn btn-secondary btn-sm">
                See plans
              </Link>
            }
          >
            <strong className="font-semibold">{cappedCopy.title}.</strong> {cappedCopy.body}
          </Notice>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            {STEPS.map((s, i) => (
              <section key={s.id} id={`section-${s.id}`} aria-labelledby={`section-${s.id}-title`} className="bg-surface shadow-card border-line-soft scroll-mt-4 rounded-[var(--radius-card)] border p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="bg-sunken text-ink-3 grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[11px]">{i + 1}</span>
                  <div>
                    <h2 id={`section-${s.id}-title`} className="text-ink m-0 text-[15px] font-semibold">
                      {s.title}
                    </h2>
                    <p className="text-ink-3 mt-0.5 text-[12.5px]">{s.description}</p>
                  </div>
                </div>
                {sections[s.id]}
              </section>
            ))}
            {formError ? (
              <p role="alert" className="bg-refuse-soft text-refuse rounded-xl px-3 py-2 text-[13px]">
                {formError}
              </p>
            ) : null}
            <div className="bg-surface/90 border-line-soft sticky bottom-0 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 backdrop-blur-sm">
              <span className="text-ink-3 text-[12.5px]">{Object.keys(errors).length > 0 ? "Something to fix above." : mode === "create" ? (ready.publishable ? "Publishing puts it on your club page and in followers' feeds." : `${ready.required.filter((i) => !i.done).length} to go before it can be published.`) : "Every section saves together."}</span>
              <div className="flex-1" />
              <Actions {...actionProps} />
            </div>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-2 lg:self-start">
            {mode === "edit" && (context?.registered ?? 0) > 0 ? (
              <InlineAlert tone="warning" title={`${context!.registered} ${context!.registered === 1 ? "person has" : "people have"} signed up`}>
                Changing the day, the place or the fee affects them. Push a live update afterwards so they hear it from you.{" "}
                <Link href={`/events/${eventId}/live?view=updates`} className="underline">
                  Live updates
                </Link>
              </InlineAlert>
            ) : null}
            <ReadinessRail values={values} errors={errors as Record<string, unknown>} />
            <div>
              <p className="eyebrow mb-2">As people see it</p>
              <Preview values={values} posterUrl={context?.posterUrl} clubName={club.data?.name ?? "Your club"} />
            </div>
          </aside>
        </div>
      </form>
    </Form>
  );
}
