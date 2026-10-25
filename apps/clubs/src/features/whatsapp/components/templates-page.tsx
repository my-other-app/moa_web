"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Notice,
  Segmented,
  Skeleton,
  StatusBadge,
  Textarea,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";
import { ApiError } from "@moa/api";

import { isPlanLockError } from "@/features/plan";

import {
  forbiddenText,
  isPermissionError,
  isPrivateError,
  templateErrorMessage,
  useAccount,
  useCreateTemplate,
  useDeleteTemplate,
  useInstallStandard,
  useTemplates,
} from "../queries";
import {
  BUTTON_TYPES,
  NO_WHATSAPP,
  PRIVATE_MESSAGE,
  STANDARD_LABEL,
  TEMPLATE_STATUS_TONE,
  checkTemplate,
  templateStatusLabel,
  variables,
  type ButtonType,
  type Template,
  type TemplateForm,
  type TemplateProblem,
} from "../schemas";
import { Field, NoAccessPanel, UpgradeNotice, WhatsAppHeader, WhatsAppUnavailable } from "./shared";

/** The languages clubs here write in; Meta takes more. */
const LANGUAGES = [
  ["en", "English"],
  ["en_US", "English (US)"],
  ["en_GB", "English (UK)"],
  ["hi", "Hindi"],
  ["ml", "Malayalam"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["mr", "Marathi"],
  ["bn", "Bengali"],
  ["gu", "Gujarati"],
  ["pa", "Punjabi"],
] as const;

const BUTTON_LABEL: Record<ButtonType, string> = { QUICK_REPLY: "Quick reply", URL: "Link", PHONE_NUMBER: "Phone number" };

export const EMPTY_TEMPLATE: TemplateForm = {
  name: "",
  language: "en",
  category: "UTILITY",
  headerText: "",
  headerExamples: [],
  body: "",
  bodyExamples: [],
  footer: "",
  buttons: [],
};

/**
 * The club's WhatsApp templates, on its own WhatsApp Business Account: read
 * live from Meta, made here (Meta reviews each: Pending, then Approved or
 * Rejected with a reason), deleted here. A template is what reaches someone
 * after the 24-hour window, and what tickets go out as from the club's number.
 */
export function WhatsAppTemplatesPage() {
  const account = useAccount();
  const a = account.data;
  const ready = Boolean(a?.connected && a?.can_inbox);
  const q = useTemplates(true, ready);
  const [creating, setCreating] = React.useState(false);

  const forbidden = account.isError && (isPermissionError(account.error) || isPrivateError(account.error));
  const listForbidden = q.isError && (isPermissionError(q.error) || isPrivateError(q.error));

  // A server without the feature (its routes answer a bare 404): no templates to keep yet.
  if (a && !a.on_server) return <WhatsAppUnavailable />;

  return (
    <div className="flex flex-col gap-3.5">
      <WhatsAppHeader
        title="WhatsApp"
        sub="Message templates Meta approved for your number"
        right={
          ready && !creating ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => void q.refetch()} disabled={q.isFetching}>
                {q.isFetching ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />} Refresh
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={!a?.plan_allows}>
                <PlusIcon className="size-4" /> New template
              </button>
            </>
          ) : null
        }
      />

      {forbidden || listForbidden ? (
        <NoAccessPanel title="Templates aren't open to you" body={forbiddenText(account.error ?? q.error)} />
      ) : account.isError ? (
        <EmptyState tone="muted" title="Could not load WhatsApp" description="Try reloading the page." />
      ) : !a ? (
        <Skeleton className="h-[320px] rounded-2xl" />
      ) : !a.can_inbox ? (
        a.impersonated ? (
          <NoAccessPanel title="Templates are for the club's own team" body={PRIVATE_MESSAGE} />
        ) : (
          <NoAccessPanel title="Templates need the WhatsApp permission" body="The club's owner gives it person by person on the Access page." />
        )
      ) : !a.connected ? (
        <>
          {!a.plan_allows ? <UpgradeNotice upgrade={a.upgrade} /> : null}
          <EmptyState
            tone="muted"
            title="Connect your WhatsApp number first"
            description="Templates live on your WhatsApp Business Account."
            action={
              a.can_manage ? (
                <Link href="/whatsapp/settings" className="btn btn-primary btn-sm">
                  Connect a number
                </Link>
              ) : undefined
            }
          />
        </>
      ) : (
        <>
          {!a.plan_allows ? <UpgradeNotice upgrade={a.upgrade} /> : null}
          {creating ? <TemplateFormPanel onDone={() => setCreating(false)} /> : null}
          {q.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load your templates"
              description={q.error instanceof ApiError && q.error.errorCode === NO_WHATSAPP ? "Connect your WhatsApp number first." : "Try again in a minute."}
            />
          ) : !q.data ? (
            <Skeleton className="h-[240px] rounded-2xl" />
          ) : (
            <>
              {q.data.stale ? (
                <Notice tone="caution" tag="Meta">
                  Meta couldn&apos;t be reached, so this is the list as it was last read. Refresh in a minute.
                </Notice>
              ) : null}
              {q.data.standard_missing.length && a.plan_allows ? <StandardTemplates missing={q.data.standard_missing} /> : null}
              <TemplateList items={q.data.items} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── MyOtherApp's ticket templates ───────────────────────────────────────

function StandardTemplates({ missing }: { missing: string[] }) {
  const install = useInstallStandard();
  const [results, setResults] = React.useState<Record<string, string> | null>(null);
  return (
    <FigurePanel className="flex flex-col gap-2.5 p-4" role="region" aria-label="MyOtherApp's templates">
      <CardLabel>Tickets from your number</CardLabel>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">
        Add MyOtherApp&apos;s ticket, reminder and certificate templates to your account. Once Meta approves them, your tickets, certificates and reminders go
        out from your own number. Missing: {missing.map((m) => STANDARD_LABEL[m] ?? m).join(", ")}.
      </p>
      {results ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]" aria-label="What Meta said">
          {Object.entries(results).map(([name, said]) => (
            <li key={name} className="flex flex-wrap gap-1.5">
              <span className="text-ink font-medium">{STANDARD_LABEL[name] ?? name}:</span>
              <span className={said === "submitted" || said === "exists" ? "text-admit" : "text-refuse"}>
                {said === "submitted" ? "submitted for review" : said === "exists" ? "already there" : said}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-sm self-start"
        disabled={install.isPending}
        onClick={() =>
          install.mutate(undefined, {
            onSuccess: (r) => {
              setResults(r.results);
              toast.success("Sent to Meta for review.");
            },
            onError: (error) => {
              if (!isPlanLockError(error)) toast.error(templateErrorMessage(error).text);
            },
          })
        }
      >
        {install.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <SparklesIcon className="size-3.5" />} Add MyOtherApp&apos;s templates
      </button>
    </FigurePanel>
  );
}

// ─── The list ────────────────────────────────────────────────────────────

const keyOf = (t: Pick<Template, "name" | "language">) => `${t.name}|${t.language}`;

function TemplateList({ items }: { items: Template[] }) {
  const remove = useDeleteTemplate();
  const [asking, setAsking] = React.useState<Template | null>(null);
  // Why Meta refused to delete one (INVALID_TEMPLATE carries its words), shown on that template.
  const [refused, setRefused] = React.useState<{ key: string; text: string } | null>(null);
  if (items.length === 0) {
    return <EmptyState tone="muted" title="No templates yet" description="Make one for the messages you send after the 24-hour window: event updates, follow-ups, thank-yous." />;
  }
  const confirm = () => {
    const t = asking;
    setAsking(null);
    if (!t) return;
    setRefused(null);
    remove.mutate(
      { name: t.name, language: t.language },
      {
        onSuccess: () => toast.success(`Deleted ${t.name} (${t.language}).`),
        onError: (error) => {
          if (!isPlanLockError(error)) setRefused({ key: keyOf(t), text: templateErrorMessage(error).text });
        },
      },
    );
  };
  return (
    <FigurePanel className="p-0" role="region" aria-label="Templates">
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((t) => (
          <li key={keyOf(t)} className="border-line-soft flex flex-col gap-1.5 border-b px-4 py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink font-mono text-[13px] font-semibold">{t.name}</span>
              <span className="tag">{t.language}</span>
              {t.category ? <span className="text-ink-3 text-[11.5px]">{t.category.charAt(0) + t.category.slice(1).toLowerCase()}</span> : null}
              <span className="flex-1" />
              {t.flagged ? <StatusBadge label="Flagged by Meta: at risk" tone="warning" /> : null}
              <StatusBadge label={templateStatusLabel(t.status)} tone={TEMPLATE_STATUS_TONE[t.status ?? ""] ?? "default"} />
              <button
                type="button"
                className="btn btn-ghost btn-xs text-refuse"
                aria-label={`Delete ${t.name} (${t.language})`}
                onClick={() => setAsking(t)}
                disabled={remove.isPending}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
            {t.header?.format === "TEXT" && t.header.text ? <p className="text-ink m-0 text-[12.5px] font-semibold">{t.header.text}</p> : null}
            {t.header && t.header.format !== "TEXT" ? <p className="text-ink-3 m-0 text-[12px]">Header: {t.header.format?.toLowerCase()}</p> : null}
            <p className="text-ink-2 m-0 text-[12.5px] whitespace-pre-wrap">{t.body}</p>
            {t.buttons.length ? (
              <div className="flex flex-wrap gap-1.5">
                {t.buttons.map((b) => (
                  <span key={b.index} className="tag">
                    {b.text}
                  </span>
                ))}
              </div>
            ) : null}
            {t.rejected_reason ? (
              <p className="text-refuse m-0 text-[12px]">
                Meta&apos;s reason: {t.rejected_reason.replace(/_/g, " ").toLowerCase()}
              </p>
            ) : null}
            {t.flagged ? (
              <p className="text-caution m-0 text-[12px]">People reacted badly to it, so Meta may pause it. Edit it in WhatsApp Manager or send it less.</p>
            ) : null}
            {refused?.key === keyOf(t) ? (
              <Notice tone="refuse" tag="Not deleted">
                {refused.text}
              </Notice>
            ) : null}
          </li>
        ))}
      </ul>
      <AlertDialog open={asking !== null} onOpenChange={(open) => (open ? null : setAsking(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {asking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes from your WhatsApp account at Meta, in {asking?.language}. Meta won&apos;t let you use the same name again for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={confirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

// ─── Making one ──────────────────────────────────────────────────────────

function fit(list: string[], n: number): string[] {
  return Array.from({ length: n }, (_, i) => list[i] ?? "");
}

export function TemplateFormPanel({ onDone }: { onDone: () => void }) {
  const create = useCreateTemplate();
  const [form, setForm] = React.useState<TemplateForm>(EMPTY_TEMPLATE);
  const [problem, setProblem] = React.useState<TemplateProblem | null>(null);
  const bodyVars = variables(form.body).length;
  const headerVars = variables(form.headerText).length;
  const set = (patch: Partial<TemplateForm>) => setForm((f) => ({ ...f, ...patch }));
  const errorFor = (field: string) => (problem?.field === field ? problem.text : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ready = { ...form, bodyExamples: fit(form.bodyExamples, bodyVars), headerExamples: fit(form.headerExamples, headerVars) };
    const p = checkTemplate(ready);
    setProblem(p);
    if (p) return;
    try {
      await create.mutateAsync(ready);
      toast.success(`${ready.name} sent to Meta for review.`);
      onDone();
    } catch (error) {
      if (isPlanLockError(error)) return;
      setProblem(templateErrorMessage(error));
    }
  };

  const setButton = (i: number, patch: Partial<TemplateForm["buttons"][number]>) =>
    set({ buttons: form.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="New template">
      <CardLabel
        right={
          <button type="button" className="btn btn-ghost btn-xs" onClick={onDone} aria-label="Close the form">
            <XIcon className="size-3.5" />
          </button>
        }
      >
        New template
      </CardLabel>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-label="New template">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field id="tpl-name" label="Name" error={errorFor("name")} help="Lowercase letters, numbers and underscores, like event_update.">
            <input
              id="tpl-name"
              className="input h-10 w-full font-mono"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              aria-invalid={Boolean(errorFor("name")) || undefined}
            />
          </Field>
          <Field id="tpl-language" label="Language" error={errorFor("language")}>
            <NativeSelect id="tpl-language" value={form.language} onChange={(e) => set({ language: e.target.value })}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label} ({code})
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {/* Segmented takes no description of its own: the group around it carries it. */}
        <div role="group" aria-describedby="tpl-category-help">
          <span className="eyebrow mb-1.5 block">Category</span>
          <Segmented
            label="Category"
            value={form.category}
            options={[
              { value: "UTILITY", label: "Utility" },
              { value: "MARKETING", label: "Marketing" },
            ]}
            onChange={(category) => set({ category })}
            className="max-w-[320px]"
          />
          <p id="tpl-category-help" className="text-ink-3 m-0 mt-1 text-[12px]">
            Utility: about something they signed up for. Marketing: anything promotional (Meta charges more).
          </p>
        </div>

        <Field id="tpl-header" label="Header (optional)" error={errorFor("header")} help="A short line in bold, at most 60 characters. One variable at most.">
          <input id="tpl-header" className="input h-10 w-full" value={form.headerText} onChange={(e) => set({ headerText: e.target.value })} />
        </Field>
        {headerVars ? (
          <Field id="tpl-header-example" label="Example for the header's {{1}}" error={problem?.field === "header_examples" ? problem.text : null}>
            <input
              id="tpl-header-example"
              className="input h-10 w-full"
              value={form.headerExamples[0] ?? ""}
              onChange={(e) => set({ headerExamples: [e.target.value] })}
            />
          </Field>
        ) : null}

        <Field
          id="tpl-body"
          label="Message"
          error={problem?.field === "body" ? problem.text : null}
          help="Use {{1}}, {{2}} for what changes each time, like a name or an event. Not at the very start or end."
        >
          <Textarea id="tpl-body" rows={4} value={form.body} maxLength={1024} onChange={(e) => set({ body: e.target.value })} aria-invalid={problem?.field === "body" || undefined} />
        </Field>
        {bodyVars ? (
          <div className="flex flex-col gap-2" role="group" aria-label="Examples" aria-describedby={problem?.field === "body_examples" ? "tpl-body-examples-error" : undefined}>
            <span className="eyebrow">Examples, for Meta&apos;s review</span>
            {Array.from({ length: bodyVars }, (_, i) => (
              <input
                key={i}
                className="input h-9 w-full"
                aria-label={`Example for {{${i + 1}}}`}
                placeholder={`{{${i + 1}}}`}
                value={form.bodyExamples[i] ?? ""}
                onChange={(e) => set({ bodyExamples: fit(form.bodyExamples, bodyVars).map((x, j) => (j === i ? e.target.value : x)) })}
              />
            ))}
            {problem?.field === "body_examples" ? (
              <p id="tpl-body-examples-error" className="text-refuse m-0 text-[12px]">
                {problem.text}
              </p>
            ) : null}
          </div>
        ) : null}

        <Field id="tpl-footer" label="Footer (optional)" error={errorFor("footer")} help="Small grey text under the message, at most 60 characters.">
          <input id="tpl-footer" className="input h-10 w-full" value={form.footer} onChange={(e) => set({ footer: e.target.value })} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="eyebrow">Buttons (optional)</span>
          {form.buttons.map((b, i) => (
            <div key={i} className="bg-sunken flex flex-col gap-2 rounded-xl p-2.5" role="group" aria-label={`Button ${i + 1}`}>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect size="sm" aria-label={`Button ${i + 1} kind`} value={b.type} onChange={(e) => setButton(i, { type: e.target.value as ButtonType })} className="w-[150px]">
                  {BUTTON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BUTTON_LABEL[t]}
                    </option>
                  ))}
                </NativeSelect>
                <input className="input input-sm min-w-0 flex-1" aria-label={`Button ${i + 1} text`} placeholder="Button text" value={b.text} maxLength={25} onChange={(e) => setButton(i, { text: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Remove button ${i + 1}`} onClick={() => set({ buttons: form.buttons.filter((_, j) => j !== i) })}>
                  <XIcon className="size-3.5" />
                </button>
              </div>
              {b.type === "URL" ? (
                <>
                  <input className="input input-sm" aria-label={`Button ${i + 1} address`} placeholder="https://… (may end in {{1}})" value={b.url ?? ""} onChange={(e) => setButton(i, { url: e.target.value })} />
                  {variables(b.url).length ? (
                    <input className="input input-sm" aria-label={`Button ${i + 1} example address`} placeholder="https://… the whole address, filled in" value={b.example ?? ""} onChange={(e) => setButton(i, { example: e.target.value })} />
                  ) : null}
                </>
              ) : b.type === "PHONE_NUMBER" ? (
                <input className="input input-sm" aria-label={`Button ${i + 1} phone number`} placeholder="+91 98470 12345" value={b.phone_number ?? ""} onChange={(e) => setButton(i, { phone_number: e.target.value })} />
              ) : null}
              {errorFor(`buttons.${i}`) ? <p className="text-refuse m-0 text-[12px]">{errorFor(`buttons.${i}`)}</p> : null}
            </div>
          ))}
          {problem?.field === "buttons" ? <p className="text-refuse m-0 text-[12px]">{problem.text}</p> : null}
          {form.buttons.length < 10 ? (
            <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => set({ buttons: [...form.buttons, { type: "QUICK_REPLY", text: "" }] })}>
              <PlusIcon className="size-3.5" /> Add a button
            </button>
          ) : null}
        </div>

        {problem && (problem.field === "form" || problem.field === "category") ? (
          <Notice tone="refuse" tag="Not sent">
            {problem.text}
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Submit for review
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone} disabled={create.isPending}>
            Cancel
          </button>
        </div>
      </form>
    </FigurePanel>
  );
}
