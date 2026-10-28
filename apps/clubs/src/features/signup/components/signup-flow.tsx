"use client";

import * as React from "react";
import Link from "next/link";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2Icon, CheckIcon, CircleIcon, ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button, ChoiceCard, Combobox, Notice, Segmented, cn } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";
import { TopicChips, resolveTopics } from "@moa/app-kit";

import { isFree, priceLine, usePlans, type Catalog, type Cycle } from "@/features/billing";
import { useOrganizations } from "@/features/club";
import { TopicPicker, useTopicTree } from "@/features/topics";
import { VenuePicker } from "@/features/venue";
import { COLUMN_IMAGE_MAX, IMAGE_ACCEPT, IMAGE_FORMATS_LABEL, fitImage, isPicture } from "@/lib/images";

import { applyForClub } from "../api";
import {
  ABOUT_MAX,
  NAME_MAX,
  PASSWORD_MIN,
  STEPS,
  emptySignup,
  mapLinkFor,
  resolvePlanKey,
  signupErrors,
  signupSchema,
  stepOf,
  type SignupField,
  type SignupValues,
} from "../schemas";

/**
 * A club applying to join, in four short steps: the club, how to reach and
 * sign in as it, what it is about, and a last look with the plan it came
 * for. The application waits for an admin's approval; the plan is only
 * asked for here and chosen for real, and paid for, from Plan & billing
 * once the club can sign in.
 */

const label = "eyebrow mb-1.5 block";
const field = "input h-10 w-full";

type Form = UseFormReturn<SignupValues>;

function Err({ id, message }: { id: string; message?: string | null }) {
  return message ? (
    <p id={id} className="text-refuse m-0 mt-1 text-[12px]">
      {message}
    </p>
  ) : null;
}

/** aria wiring for a field and its error line. */
function describe(form: Form, name: SignupField, extra?: string) {
  const error = form.formState.errors[name];
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [error ? `su-${name}-error` : null, extra].filter(Boolean).join(" ") || undefined,
  } as const;
}

export function SignupFlow({ initialPlan, initialCycle }: { initialPlan: string; initialCycle: Cycle }) {
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: emptySignup(initialPlan, initialCycle),
    mode: "onTouched",
  });
  const [step, setStep] = React.useState(0);
  const [logo, setLogo] = React.useState<File | null>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ name: string; email: string } | null>(null);
  const plans = usePlans();
  const apply = useMutation({ mutationFn: ({ values, file }: { values: SignupValues; file: File | null }) => applyForClub(values, file) });
  const last = STEPS.length - 1;

  if (done) return <Applied name={done.name} email={done.email} />;

  const next = async () => {
    if (await form.trigger([...STEPS[step]!.fields])) setStep((s) => Math.min(last, s + 1));
  };

  const send = form.handleSubmit(
    async (values) => {
      setMessage(null);
      setLogoError(null);
      try {
        const club = await apply.mutateAsync({ values: { ...values, requested_plan: resolvePlanKey(values.requested_plan, plans.data) }, file: logo });
        setDone({ name: club.name, email: values.email.trim() });
      } catch (error) {
        const mapped = signupErrors(error);
        const names = Object.keys(mapped.fields) as (SignupField | "logo")[];
        for (const name of names) {
          const text = mapped.fields[name];
          if (name === "logo") setLogoError(text ?? null);
          else form.setError(name, { type: "server", message: text });
        }
        if (names.length) setStep(Math.min(...names.map(stepOf)));
        setMessage(mapped.message);
      }
    },
    (errors) => setStep(Math.min(...(Object.keys(errors) as SignupField[]).map(stepOf))),
  );

  const busy = apply.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Apply to join</h1>
        <p className="text-ink-2 mt-1.5 text-[13.5px]">Tell us about your club. We review every application, usually within a day.</p>
      </div>

      <Steps current={step} onPick={(i) => i < step && setStep(i)} />

      <form
        noValidate
        aria-label={STEPS[step]!.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < last) void next();
          else void send(e);
        }}
        className="flex flex-col gap-4"
      >
        {step === 0 ? <ClubStep form={form} logo={logo} logoError={logoError} onLogo={(file, error) => {
              setLogo(file);
              setLogoError(error);
            }} disabled={busy} /> : null}
        {step === 1 ? <ContactStep form={form} disabled={busy} /> : null}
        {step === 2 ? <MoreStep form={form} disabled={busy} /> : null}
        {step === 3 ? <ReviewStep form={form} logo={logo} catalog={plans.data} plansFailed={plans.isError} onEdit={setStep} disabled={busy} /> : null}

        {message ? <Notice tone="refuse">{message}</Notice> : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </Button>
          ) : (
            <p className="text-ink-3 m-0 text-[12.5px]">
              Already approved?{" "}
              <Link href="/login" className="text-brand">
                Sign in
              </Link>
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {step < last ? "Continue" : busy ? "Sending…" : "Send application"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── The step rail ───────────────────────────────────────────────────────

function Steps({ current, onPick }: { current: number; onPick: (i: number) => void }) {
  return (
    <ol aria-label="Steps" className="m-0 grid list-none grid-cols-4 gap-2 p-0">
      {STEPS.map((s, i) => {
        const doneStep = i < current;
        return (
          <li key={s.id} aria-current={i === current ? "step" : undefined}>
            <button
              type="button"
              onClick={() => onPick(i)}
              disabled={!doneStep}
              className={cn(
                "flex w-full flex-col items-start gap-1.5 border-0 bg-transparent p-0 text-left disabled:cursor-default",
                i === current ? "text-ink" : doneStep ? "text-ink-2 hover:text-ink" : "text-ink-3",
              )}
            >
              <span className={cn("h-1 w-full rounded-full", i <= current ? "bg-brand" : "bg-sunken")} aria-hidden="true" />
              <span className="text-[11.5px] leading-[1.3] font-medium max-sm:sr-only">{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─── 1. The club ─────────────────────────────────────────────────────────

function ClubStep({ form, logo, logoError, onLogo, disabled }: { form: Form; logo: File | null; logoError: string | null; onLogo: (file: File | null, error: string | null) => void; disabled: boolean }) {
  const { errors } = form.formState;
  const name = useWatch({ control: form.control, name: "name" }) ?? "";
  const about = useWatch({ control: form.control, name: "about" }) ?? "";
  const { data: orgs, isError: orgsFailed } = useOrganizations();
  const preview = useObjectUrl(logo);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const over = name.trim().length > NAME_MAX;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!isPicture(file)) return onLogo(null, `Choose a picture: ${IMAGE_FORMATS_LABEL}.`);
    try {
      // Converted when the API does not keep its format (an SVG, a HEIC...), and redrawn smaller when over budget.
      onLogo(await fitImage(file, "logo", { limit: COLUMN_IMAGE_MAX }), null);
    } catch (error) {
      onLogo(null, error instanceof Error ? error.message : "That picture is too big to send.");
    }
  };

  return (
    <>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="su-name" className={label}>
            Club name
          </label>
          <span id="su-name-count" className={cn("micro tabular-nums", over ? "text-refuse" : "text-ink-3")} aria-live="polite">
            {name.trim().length} / {NAME_MAX}
          </span>
        </div>
        <input id="su-name" className={field} autoComplete="organization" disabled={disabled} {...describe(form, "name", "su-name-count")} {...form.register("name")} />
        <Err id="su-name-error" message={errors.name?.message} />
      </div>

      <div>
        <span className={label}>Logo</span>
        <div className="flex items-center gap-3">
          <span className="border-line bg-sunken grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a served image */}
            {preview ? <img src={preview} alt="Logo preview" className="size-full object-cover" /> : <ImagePlusIcon className="text-ink-3 size-5" />}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={disabled}>
              {logo ? "Choose another" : "Add a logo"}
            </button>
            {logo ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onLogo(null, null)} disabled={disabled}>
                <XIcon className="size-3.5" /> Remove
              </button>
            ) : (
              <span className="text-ink-3 text-[12px]">Optional. Square works best.</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-label="Logo file"
            tabIndex={-1}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <Err id="su-logo-error" message={logoError} />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="su-about" className={label}>
            About
          </label>
          <span className="micro text-ink-3 tabular-nums">
            {about.length.toLocaleString("en-IN")} / {ABOUT_MAX.toLocaleString("en-IN")}
          </span>
        </div>
        <textarea id="su-about" rows={3} className="input min-h-[84px] w-full py-2" placeholder="What the club does, who it is for, what it runs." disabled={disabled} {...describe(form, "about")} {...form.register("about")} />
        <Err id="su-about-error" message={errors.about?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="su-org" className={label}>
            College or organisation
          </label>
          <Controller
            control={form.control}
            name="org_id"
            render={({ field: f }) => (
              <Combobox
                id="su-org"
                label="College or organisation"
                value={f.value}
                options={(orgs ?? []).map((o) => ({ value: o.id, label: o.name, hint: [o.type, o.address].filter(Boolean).join(" · ") || undefined }))}
                onChange={f.onChange}
                placeholder="Choose your college"
                emptyText="Not on the list? Leave it empty; we'll add it."
                loading={!orgs && !orgsFailed}
                disabled={disabled || orgsFailed}
              />
            )}
          />
          <p className="micro text-ink-3 mt-1.5">{orgsFailed ? "The list could not load. You can add it from your profile later." : "Leave it empty if the club is not part of one."}</p>
        </div>
        <div>
          <label htmlFor="su-location" className={label}>
            Location
          </label>
          <Controller
            control={form.control}
            name="location_name"
            render={({ field: f }) => (
              <VenuePicker
                id="su-location"
                name={f.name}
                ref={f.ref}
                value={f.value}
                onBlur={f.onBlur}
                onChange={(v) => {
                  f.onChange(v);
                  // Typed over: the pin from an earlier pick no longer describes it.
                  form.setValue("location_link", "");
                }}
                onPick={(place) => form.setValue("location_link", mapLinkFor(place.point))}
                placeholder="Search for your campus, or type the city"
                disabled={disabled}
              />
            )}
          />
          <Err id="su-location_name-error" message={errors.location_name?.message} />
        </div>
      </div>
    </>
  );
}

// ─── 2. Contact and login ────────────────────────────────────────────────

function ContactStep({ form, disabled }: { form: Form; disabled: boolean }) {
  const { errors } = form.formState;
  const [email, password, confirm] = useWatch({ control: form.control, name: ["email", "password", "confirm_password"] });
  const rules = [
    { text: `${PASSWORD_MIN} or more characters`, met: (password ?? "").length >= PASSWORD_MIN },
    { text: "Not the email address", met: Boolean(password) && password.trim().toLowerCase() !== (email ?? "").trim().toLowerCase() },
    { text: "Both passwords match", met: Boolean(password) && password === confirm },
  ];

  return (
    <>
      <div>
        <label htmlFor="su-email" className={label}>
          Login email
        </label>
        <input id="su-email" type="email" className={field} autoComplete="email" disabled={disabled} {...describe(form, "email", "su-email-hint")} {...form.register("email")} />
        <p id="su-email-hint" className="micro text-ink-3 mt-1.5">
          The club signs in with this. We write here when the application is approved.
        </p>
        <Err id="su-email-error" message={errors.email?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="su-password" className={label}>
            Password
          </label>
          <input id="su-password" type="password" className={field} autoComplete="new-password" disabled={disabled} {...describe(form, "password", "su-password-rules")} {...form.register("password")} />
          <Err id="su-password-error" message={errors.password?.message} />
        </div>
        <div>
          <label htmlFor="su-confirm" className={label}>
            Password again
          </label>
          <input id="su-confirm" type="password" className={field} autoComplete="new-password" disabled={disabled} {...describe(form, "confirm_password")} {...form.register("confirm_password")} />
          <Err id="su-confirm_password-error" message={errors.confirm_password?.message} />
        </div>
      </div>
      <ul id="su-password-rules" aria-label="Password rules" className="m-0 -mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
        {rules.map((r) => (
          <li key={r.text} data-met={r.met} className={cn("flex items-center gap-1.5", r.met ? "text-admit" : "text-ink-3")}>
            {r.met ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <CircleIcon className="size-3" aria-hidden="true" />}
            {r.text}
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="su-phone" className={label}>
            Contact phone
          </label>
          <input id="su-phone" type="tel" className={field} autoComplete="tel" placeholder="+91 98470 12345" disabled={disabled} {...describe(form, "contact_phone")} {...form.register("contact_phone")} />
          <Err id="su-contact_phone-error" message={errors.contact_phone?.message} />
        </div>
        <div>
          <label htmlFor="su-contact-email" className={label}>
            Contact email
          </label>
          <input id="su-contact-email" type="email" className={field} autoComplete="email" placeholder="Optional" disabled={disabled} {...describe(form, "contact_email")} {...form.register("contact_email")} />
          <Err id="su-contact_email-error" message={errors.contact_email?.message} />
        </div>
      </div>
      <p className="micro text-ink-3 m-0 -mt-1">How people reach the club. Both are optional.</p>
    </>
  );
}

// ─── 3. Interests and links ──────────────────────────────────────────────

const SOCIALS = [
  { name: "instagram", text: "Instagram", placeholder: "https://instagram.com/yourclub" },
  { name: "linkedin", text: "LinkedIn", placeholder: "https://linkedin.com/company/yourclub" },
  { name: "youtube", text: "YouTube", placeholder: "https://youtube.com/@yourclub" },
  { name: "website", text: "Website", placeholder: "https://yourclub.org" },
] as const;

function MoreStep({ form, disabled }: { form: Form; disabled: boolean }) {
  const { errors } = form.formState;
  const picked = useWatch({ control: form.control, name: "interest_ids" }) ?? [];

  return (
    <>
      <div>
        <span className={label}>Interests</span>
        <p className="text-ink-3 m-0 mb-2 text-[12px]">What the club is about. Students who follow these find it.</p>
        <TopicPicker
          value={picked}
          onChange={(next) => form.setValue("interest_ids", next, { shouldDirty: true })}
          disabled={disabled}
          listMaxHeight={300}
          errorText="Interests could not load just now. You can pick them from Club profile once you're approved."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIALS.map((s) => (
          <div key={s.name}>
            <label htmlFor={`su-${s.name}`} className={label}>
              {s.text}
            </label>
            <input id={`su-${s.name}`} type="url" className={field} placeholder={s.placeholder} disabled={disabled} {...describe(form, s.name)} {...form.register(s.name)} />
            <Err id={`su-${s.name}-error`} message={errors[s.name]?.message} />
          </div>
        ))}
      </div>
      <p className="micro text-ink-3 m-0 -mt-1">All optional. Links show on your club page.</p>
    </>
  );
}

// ─── 4. Review ───────────────────────────────────────────────────────────

const titleCase = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function ReviewStep({ form, logo, catalog, plansFailed, onEdit, disabled }: { form: Form; logo: File | null; catalog?: Catalog; plansFailed: boolean; onEdit: (step: number) => void; disabled: boolean }) {
  const v = useWatch({ control: form.control }) as SignupValues;
  const { data: orgs } = useOrganizations();
  const { data: tree } = useTopicTree();
  const planKey = resolvePlanKey(v.requested_plan, catalog);
  const plan = catalog?.plans.find((p) => p.key === planKey);
  const cycle = v.requested_cycle;
  const interestNames = (tree ?? []).flatMap((c) => c.interests).filter((i) => v.interest_ids.includes(i.id)).map((i) => i.name);
  const topics = tree ? resolveTopics({ interests: v.interest_ids.map((id) => ({ id })) }, tree) : [];
  const links = [v.instagram, v.linkedin, v.youtube, v.website].filter(Boolean);

  const sections: { step: number; title: string; rows: [string, React.ReactNode][] }[] = [
    {
      step: 0,
      title: "Your club",
      rows: [
        ["Name", v.name],
        ["Logo", logo ? logo.name : "None"],
        ["College", orgs?.find((o) => o.id === v.org_id)?.name ?? "None"],
        ["Location", v.location_name || "Not given"],
      ],
    },
    {
      step: 1,
      title: "Contact and login",
      rows: [
        ["Login email", v.email],
        ["Phone", v.contact_phone || "Not given"],
        ["Contact email", v.contact_email || "Not given"],
      ],
    },
    {
      step: 2,
      title: "Interests and links",
      rows: [
        ["Interests", interestNames.length ? interestNames.join(", ") : "None yet"],
        ...(topics.length ? [["Topics", <TopicChips key="topics" topics={topics} size="xs" />] as [string, React.ReactNode]] : []),
        ["Links", links.length ? `${links.length} added` : "None"],
      ],
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <section key={s.title} aria-label={s.title} className="border-line-soft rounded-xl border px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-ink m-0 text-[13px] font-semibold">{s.title}</h2>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(s.step)} disabled={disabled} aria-label={`Edit ${s.title.toLowerCase()}`}>
                Edit
              </button>
            </div>
            <dl className="m-0 mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
              {s.rows.map(([k, value]) => (
                <React.Fragment key={k}>
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-ink m-0 min-w-0 truncate">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className={label}>Plan</span>
          {!plan || (!isFree(plan) && !plan.contact_sales) ? (
            <Segmented
              label="Billing cycle"
              value={cycle}
              onChange={(c) => form.setValue("requested_cycle", c)}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: catalog?.yearly_months_free ? `Yearly · ${catalog.yearly_months_free} months free` : "Yearly" },
              ]}
            />
          ) : null}
        </div>
        {catalog ? (
          <div role="radiogroup" aria-label="Plan" className="mt-2 grid gap-2 sm:grid-cols-2">
            {catalog.plans.map((p) => {
              const price = priceLine(p, cycle);
              return (
                <ChoiceCard
                  key={p.key}
                  checked={p.key === planKey}
                  onClick={() => form.setValue("requested_plan", p.key)}
                  title={p.name}
                  hint={p.contact_sales ? "We'll talk about pricing" : `${price.amount}${price.per ? ` ${price.per}` : ""}${p.trial_days ? ` · ${p.trial_days}-day trial` : ""}`}
                  disabled={disabled}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-ink-2 m-0 mt-1 text-[13px]">
            {titleCase(planKey)}
            {planKey !== "free" ? `, billed ${cycle}` : ""}
            {plansFailed ? " — you'll confirm it after approval." : ""}
          </p>
        )}
        <p className="micro text-ink-3 mt-2">
          Nothing is charged now. Once you&apos;re approved, your club gets {catalog?.trial?.days ?? 14} days of {catalog?.trial?.plan_name ?? "Pro"} free, no card needed. Pick a plan any time from Plan &amp; billing; billing starts when the trial ends.
        </p>
      </div>
    </>
  );
}

// ─── Sent ────────────────────────────────────────────────────────────────

function Applied({ name, email }: { name: string; email: string }) {
  return (
    <div className="flex flex-col items-start gap-3" role="status">
      <CheckCircle2Icon className="text-admit size-8" aria-hidden="true" />
      <h1 className="page-title">Application sent</h1>
      <p className="text-ink-2 m-0 text-[14px] leading-[1.6]">
        Thanks — <strong className="text-ink">{name}</strong> is under review. We&apos;ll email <strong className="text-ink">{email}</strong> when it&apos;s approved, usually within a day. Then log in: your 14 days of Pro start then, free and with no card.
      </p>
      <Button asChild>
        <Link href="/login">Go to sign in</Link>
      </Button>
    </div>
  );
}
