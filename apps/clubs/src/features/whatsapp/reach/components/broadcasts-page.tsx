"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, MegaphoneIcon, PlusIcon, SendIcon, XIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
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
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { useClubEvents } from "@/features/events";
import { isPlanLockError } from "@/features/plan";

import { forbiddenText, isPermissionError, isPrivateError, useAccount, useTemplates } from "../../queries";
import type { Template } from "../../schemas";
import { Field, NoAccessPanel, UpgradeNotice, WhatsAppHeader, WhatsAppUnavailable, When } from "../../components/shared";
import type { BroadcastBody } from "../api";
import { broadcastErrorMessage, useBroadcasts, useCancelBroadcast, useCreateBroadcast, usePreviewBroadcast, useReach } from "../queries";
import {
  BROADCAST_KIND_HELP,
  BROADCAST_KIND_LABEL,
  BROADCAST_STATUS,
  FAILED_CODE_LABEL,
  KIND_OF_CATEGORY,
  SKIP_LABEL,
  SOURCES,
  SOURCE_LABEL,
  money,
  type Broadcast,
  type Preview,
  type Results,
  type Source,
  type Variable,
  type Variables,
} from "../schemas";

/**
 * WhatsApp -> Broadcasts: event updates and promotions from the club's own
 * number. Message content: the owner and the members with the WhatsApp
 * permission only, never an admin acting as the club (403 WHATSAPP_PRIVATE).
 * Not shown against a backend without it (its routes answer a bare 404).
 */
export function WhatsAppBroadcastsPage() {
  const account = useAccount();
  const reach = useReach();
  const a = account.data;
  const list = useBroadcasts(Boolean(a?.on_server));
  const [composing, setComposing] = React.useState(false);

  if (a && !a.on_server) return <WhatsAppUnavailable />;

  const canSend = Boolean(a?.connected && a.status === "active" && a.plan_allows && a.can_inbox);
  const forbidden = list.isError && (isPermissionError(list.error) || isPrivateError(list.error));

  return (
    <div className="flex flex-col gap-3.5">
      <WhatsAppHeader
        title="Broadcasts"
        sub="Event updates and promotions from your own number"
        right={
          canSend && list.data && !composing ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
              <PlusIcon className="size-3.5" /> New broadcast
            </button>
          ) : null
        }
      />

      {reach.data === null || list.data === null ? (
        <Notice tone="neutral" tag="Broadcasts">
          Broadcasts from your own number aren&apos;t available yet.
        </Notice>
      ) : forbidden ? (
        <NoAccessPanel title="Broadcasts aren't open to you" body={forbiddenText(list.error)} />
      ) : list.isError ? (
        <EmptyState tone="muted" title="Could not load your broadcasts" description="Try reloading the page." />
      ) : !a || list.isPending ? (
        <Skeleton className="h-[220px] rounded-2xl" />
      ) : (
        <>
          {!a.plan_allows ? <UpgradeNotice upgrade={a.upgrade} /> : null}
          {a.plan_allows && !a.connected ? (
            <Notice
              tone="neutral"
              tag="WhatsApp"
              action={
                <Link href="/whatsapp/settings" className="btn btn-secondary btn-sm">
                  Settings
                </Link>
              }
            >
              Connect your club&apos;s WhatsApp number first: broadcasts go from it.
            </Notice>
          ) : null}
          {a.connected && a.status === "failed" ? (
            <Notice tone="refuse" tag="WhatsApp">
              Your number isn&apos;t working right now, so nothing can be broadcast. See WhatsApp settings.
            </Notice>
          ) : null}
          {composing ? <BroadcastComposer onDone={() => setComposing(false)} /> : null}
          <BroadcastList items={list.data?.items ?? []} canCancel={canSend} />
        </>
      )}
    </div>
  );
}

// ─── The list ────────────────────────────────────────────────────────────

function BroadcastList({ items, canCancel }: { items: Broadcast[]; canCancel: boolean }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<MegaphoneIcon />}
        tone="muted"
        title="No broadcasts yet"
        description="Send an event's registrants an update, or your followers a promotion -- only to people who asked for WhatsApp from your club."
      />
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Broadcasts">
      {items.map((b) => (
        <BroadcastRow key={b.id} b={b} canCancel={canCancel} />
      ))}
    </ul>
  );
}

function figures(r: Results): string {
  const parts = [`${r.sent} sent`, `${r.delivered} delivered`, `${r.read} read`];
  if (r.failed) parts.push(`${r.failed} failed`);
  if (r.queued) parts.push(`${r.queued} to go`);
  return parts.join(" · ");
}

function BroadcastRow({ b, canCancel }: { b: Broadcast; canCancel: boolean }) {
  const cancel = useCancelBroadcast();
  const [confirming, setConfirming] = React.useState(false);
  const st = BROADCAST_STATUS[b.status];
  const r = b.results;
  const skipped = (Object.keys(SKIP_LABEL) as (keyof Results["skipped"])[]).filter((k) => r.skipped[k] > 0);
  return (
    <li>
      <FigurePanel className="flex flex-col gap-2 p-4" role="region" aria-label={`${BROADCAST_KIND_LABEL[b.kind]} ${b.template}`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={BROADCAST_KIND_LABEL[b.kind]} tone={b.kind === "promotion" ? "warning" : "info"} />
          <span className="text-ink font-mono text-[13px]">{b.template}</span>
          {b.event ? <span className="text-ink-2 text-[12.5px]">· {b.event.name}</span> : null}
          <span className="flex-1" />
          <StatusBadge label={st.label} tone={st.tone} />
        </div>
        <p className="text-ink-3 m-0 text-[12px]">
          {b.status === "scheduled" && b.scheduled_at ? (
            <>Goes {formatDateTime(b.scheduled_at)}</>
          ) : (
            <>
              <When iso={b.started_at ?? b.created_at} />
            </>
          )}
          {b.created_by ? ` · by ${b.created_by}` : ""}
          {b.endpoint === "marketing_messages" ? " · through Meta's Marketing Messages API" : ""}
        </p>
        <p className="text-ink m-0 text-[13px] tabular-nums">
          {r.recipients} {r.recipients === 1 ? "person" : "people"} · {figures(r)}
        </p>
        {r.waiting ? (
          <p className="text-ink-2 m-0 text-[12px]">{r.waiting} wait for a later moment: your messaging limit&apos;s next day, or Meta&apos;s retry time.</p>
        ) : null}
        {b.last_error ? (
          <Notice tone="refuse" tag="Stopped">
            {b.last_error}
          </Notice>
        ) : null}
        {r.failed_by_reason.length || skipped.length ? (
          <details className="text-[12.5px]">
            <summary className="text-ink-2 cursor-pointer">Why some didn&apos;t get it</summary>
            <ul className="text-ink-2 m-0 mt-1.5 flex list-disc flex-col gap-0.5 pl-5">
              {r.failed_by_reason.map((f) => (
                <li key={`f-${f.code}`}>
                  Failed: {FAILED_CODE_LABEL[f.code ?? ""] ?? f.title ?? "Meta refused it"} {f.code ? <span className="text-ink-3 font-mono">({f.code})</span> : null} × {f.count}
                </li>
              ))}
              {skipped.map((k) => (
                <li key={`s-${k}`}>
                  Skipped: {SKIP_LABEL[k]} × {r.skipped[k]}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {canCancel && (b.status === "scheduled" || b.status === "sending") ? (
          <div>
            <button type="button" className="btn btn-ghost btn-sm text-refuse" disabled={cancel.isPending} onClick={() => setConfirming(true)}>
              {cancel.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <XIcon className="size-3.5" />} Cancel
            </button>
          </div>
        ) : null}
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this broadcast?</AlertDialogTitle>
              <AlertDialogDescription>
                {b.status === "scheduled" ? "Nobody gets it." : "Nobody more gets it; what was sent stays sent."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className={cn(buttonVariants({ variant: "destructive" }))}
                onClick={() =>
                  cancel.mutate(b.id, {
                    onSuccess: () => toast.success("Cancelled."),
                    onError: (e) => toast.error(broadcastErrorMessage(e).text),
                  })
                }
              >
                Cancel broadcast
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FigurePanel>
    </li>
  );
}

// ─── The composer ────────────────────────────────────────────────────────

/** A value of the template a broadcast fills: where it is, and how it's named. */
export interface Slot {
  section: "header" | "body" | "buttons";
  key: string;
  label: string;
}

/** Templates a broadcast can go out with: approved, UTILITY or MARKETING, without a media header. */
export function broadcastable(templates: Template[]): Template[] {
  return templates.filter(
    (t) =>
      (t.status ?? "").toUpperCase() === "APPROVED" &&
      Boolean(KIND_OF_CATEGORY[(t.category ?? "").toUpperCase()]) &&
      !["DOCUMENT", "IMAGE", "VIDEO", "LOCATION"].includes((t.header?.format ?? "").toUpperCase()),
  );
}

/** Each value a template needs, in the order the server checks them. */
export function slotsOf(t: Template | undefined): Slot[] {
  if (!t) return [];
  const out: Slot[] = [];
  if ((t.header?.format ?? "").toUpperCase() === "TEXT") {
    for (let i = 1; i <= (t.header?.variables ?? 0); i++) out.push({ section: "header", key: String(i - 1), label: `Header {{${i}}}` });
  }
  for (let i = 1; i <= t.body_variables; i++) out.push({ section: "body", key: String(i - 1), label: `{{${i}}}` });
  for (const b of t.buttons) {
    if (b.type.toUpperCase() === "URL" && b.variables > 0) out.push({ section: "buttons", key: String(b.index), label: `Button "${b.text ?? "link"}"` });
  }
  return out;
}

/** The variables as the server takes them. */
export function variablesFor(slots: Slot[], values: Record<string, Variable>): Variables {
  const out: Variables = { header: [], body: [], buttons: {} };
  for (const s of slots) {
    const v = values[`${s.section}.${s.key}`] ?? { source: "text", value: "" };
    const clean: Variable = v.source === "text" ? { source: "text", value: v.value ?? "" } : { source: v.source };
    if (s.section === "buttons") out.buttons[s.key] = clean;
    else out[s.section].push(clean);
  }
  return out;
}

const keyOf = (t: Template) => `${t.name}|${t.language}`;
/** What a fresh value starts as: the body's first is their name, the rest the club's words. */
const startingValue = (s: Slot): Variable => (s.section === "body" && s.key === "0" ? { source: "name" } : { source: "text", value: "" });

export function BroadcastComposer({ onDone }: { onDone: () => void }) {
  const templates = useTemplates(false);
  const events = useClubEvents({ scope: "all", sort: "latest", offset: 0, limit: 50 });
  const preview = usePreviewBroadcast();
  const create = useCreateBroadcast();
  const usable = broadcastable(templates.data?.items ?? []);
  const [templateKey, setTemplateKey] = React.useState("");
  const [eventId, setEventId] = React.useState<number | null>(null);
  const [values, setValues] = React.useState<Record<string, Variable>>({});
  const [when, setWhen] = React.useState<"now" | "later">("now");
  const [at, setAt] = React.useState("");
  const [shown, setShown] = React.useState<Preview | null>(null);
  const [problem, setProblem] = React.useState<{ field: string | null; text: string } | null>(null);

  const template = usable.find((t) => keyOf(t) === templateKey);
  const kind = template ? KIND_OF_CATEGORY[(template.category ?? "").toUpperCase()] : undefined;
  const slots = slotsOf(template);
  const busy = preview.isPending || create.isPending;

  // Anything changed: the preview shown is no longer this broadcast's.
  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(null);
    setProblem(null);
  };

  const body = (): BroadcastBody => ({
    template: template!.name,
    language: template!.language || null,
    kind,
    event_id: eventId,
    // What each value shows is what goes: an untouched one is its starting value.
    variables: variablesFor(slots, Object.fromEntries(slots.map((s) => [`${s.section}.${s.key}`, values[`${s.section}.${s.key}`] ?? startingValue(s)]))),
    scheduled_at: when === "later" && at ? new Date(at).toISOString() : null,
  });

  const fail = (error: unknown) => {
    if (isPlanLockError(error)) return;
    setProblem(broadcastErrorMessage(error));
  };

  const runPreview = () => {
    setProblem(null);
    if (!template) return setProblem({ field: "template", text: "Pick an approved template." });
    if (kind === "event_update" && eventId === null) return setProblem({ field: "event_id", text: "Pick the event whose registrants get this update." });
    if (when === "later" && !at) return setProblem({ field: "scheduled_at", text: "Pick when it goes." });
    preview.mutate(body(), { onSuccess: setShown, onError: fail });
  };

  const send = () => {
    if (!shown) return;
    create.mutate(body(), {
      onSuccess: (b) => {
        toast.success(b.status === "scheduled" && b.scheduled_at ? `Scheduled for ${formatDateTime(b.scheduled_at)}.` : `Sending to ${shown.recipients} ${shown.recipients === 1 ? "person" : "people"}.`);
        onDone();
      },
      onError: fail,
    });
  };

  /** A refusal shown beside the control it is about (`errors.field`); any other on the form. */
  const err = (field: string) => (problem?.field === field ? problem.text : null);
  const besideAField =
    problem?.field !== null &&
    problem?.field !== undefined &&
    (["template", "event_id", "scheduled_at"].includes(problem.field) || slots.some((s) => `${s.section}.${s.key}` === problem.field));

  return (
    <FigurePanel className="flex flex-col gap-3.5 p-4" role="region" aria-label="New broadcast">
      <CardLabel
        right={
          <button type="button" className="btn btn-ghost btn-xs" onClick={onDone} disabled={busy}>
            Close
          </button>
        }
      >
        New broadcast
      </CardLabel>

      <Field id="bc-template" label="Template" error={err("template")} help={kind ? `${BROADCAST_KIND_LABEL[kind]}: ${BROADCAST_KIND_HELP[kind]}` : "Its category decides who gets it."}>
        <NativeSelect id="bc-template" value={templateKey} disabled={busy} onChange={(e) => changed(setTemplateKey)(e.target.value)}>
          <option value="">{templates.isPending ? "Loading templates…" : usable.length ? "Pick an approved template" : "No approved UTILITY or MARKETING template yet"}</option>
          {usable.map((t) => (
            <option key={keyOf(t)} value={keyOf(t)}>
              {t.name} ({t.language}) · {(t.category ?? "").toUpperCase() === "MARKETING" ? "promotion" : "event update"}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {template ? (
        <div className="bg-sunken text-ink-2 rounded-xl p-3 text-[12.5px] leading-[1.55] whitespace-pre-wrap" aria-label="The template's words">
          {template.body}
        </div>
      ) : null}

      <Field
        id="bc-event"
        label={kind === "promotion" ? "Event (optional, if a value names it)" : "Event"}
        error={err("event_id")}
        help={kind === "event_update" ? "Its registrants who asked for WhatsApp get the update." : undefined}
      >
        <NativeSelect id="bc-event" value={eventId === null ? "" : String(eventId)} disabled={busy} onChange={(e) => changed(setEventId)(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{kind === "promotion" ? "No event" : "Pick an event"}</option>
          {(events.data?.items ?? []).map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
              {ev.event_datetime ? ` · ${formatDateTime(ev.event_datetime)}` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {slots.length ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
          <legend className="eyebrow mb-1">What fills each value</legend>
          {slots.map((s) => {
            const id = `bc-${s.section}-${s.key}`;
            const v = values[`${s.section}.${s.key}`] ?? startingValue(s);
            const set = (next: Variable) => changed(setValues)({ ...values, [`${s.section}.${s.key}`]: next });
            return (
              <div key={id} className="grid gap-2 sm:grid-cols-[110px_200px_1fr] sm:items-start">
                <span className="text-ink font-mono text-[12.5px] sm:pt-2">{s.label}</span>
                <NativeSelect
                  id={id}
                  aria-label={`What fills ${s.label}`}
                  value={v.source}
                  disabled={busy}
                  onChange={(e) => set({ source: e.target.value as Source, value: v.value })}
                >
                  {SOURCES.filter((src) => src === "text" || s.section !== "buttons").map((src) => (
                    <option key={src} value={src}>
                      {SOURCE_LABEL[src]}
                    </option>
                  ))}
                </NativeSelect>
                {v.source === "text" ? (
                  <input
                    className="input h-9 w-full"
                    aria-label={`Your words for ${s.label}`}
                    value={v.value ?? ""}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => set({ source: "text", value: e.target.value })}
                  />
                ) : (
                  <span className="text-ink-3 text-[12px] sm:pt-2">{v.source === "name" ? "\"there\" when we don't know it" : "from the event you picked"}</span>
                )}
                {err(`${s.section}.${s.key}`) ? <p className="text-refuse m-0 text-[12px] sm:col-span-3">{err(`${s.section}.${s.key}`)}</p> : null}
              </div>
            );
          })}
        </fieldset>
      ) : null}

      <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
        <legend className="eyebrow mb-1">When</legend>
        <label className="text-ink flex items-center gap-1.5 text-[13px]">
          <input type="radio" name="bc-when" checked={when === "now"} disabled={busy} onChange={() => changed(setWhen)("now")} /> Send now
        </label>
        <label className="text-ink flex items-center gap-1.5 text-[13px]">
          <input type="radio" name="bc-when" checked={when === "later"} disabled={busy} onChange={() => changed(setWhen)("later")} /> Schedule
        </label>
        {when === "later" ? (
          <input
            type="datetime-local"
            className="input h-9"
            aria-label="When it goes"
            value={at}
            disabled={busy}
            onChange={(e) => changed(setAt)(e.target.value)}
          />
        ) : null}
        {err("scheduled_at") ? <p className="text-refuse m-0 w-full text-[12px]">{err("scheduled_at")}</p> : null}
      </fieldset>

      {problem && !besideAField ? (
        <Notice tone="refuse" tag="Not sent">
          {problem.text}
        </Notice>
      ) : null}

      {shown ? <PreviewPanel p={shown} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary" onClick={runPreview} disabled={busy || !template}>
          {preview.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Preview
        </button>
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !shown || shown.recipients === 0}>
          {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}{" "}
          {when === "later" ? "Schedule" : shown ? `Send to ${shown.recipients}` : "Send"}
        </button>
        {!shown ? <span className="text-ink-3 text-[12px]">Preview first: who gets it, and what Meta charges.</span> : null}
      </div>
    </FigurePanel>
  );
}

function PreviewPanel({ p }: { p: Preview }) {
  const e = p.estimate;
  const left = [
    p.excluded.opted_out && `${p.excluded.opted_out} asked you to stop`,
    p.excluded.no_consent && `${p.excluded.no_consent} never said yes`,
    p.excluded.no_number && `${p.excluded.no_number} have no number WhatsApp reaches`,
  ].filter(Boolean);
  const limit = e.messaging_limit;
  return (
    <div className="bg-sunken flex flex-col gap-2 rounded-xl p-3 text-[12.5px]" role="status" aria-label="Preview">
      <p className="text-ink m-0 text-[14px] font-semibold">
        {p.recipients} {p.recipients === 1 ? "person" : "people"} get it
      </p>
      {left.length ? <p className="text-ink-2 m-0">Left out: {left.join(", ")}.</p> : null}
      <p className="text-ink m-0 tabular-nums">
        About {money(e.subtotal, e.currency)} ({money(e.rate, e.currency, 4)} a message, Meta&apos;s list rate) + GST {Math.round(e.gst_rate * 100)}%{" "}
        {money(e.gst, e.currency)} = <strong className="font-semibold">{money(e.total, e.currency)}</strong>
      </p>
      <p className="text-ink-3 m-0 text-[11.5px]">{e.label || "An estimate: Meta bills what it delivers."}</p>
      {typeof limit.per_day === "number" && limit.days > 1 ? (
        <p className="text-caution m-0">
          Your number may reach {limit.per_day.toLocaleString("en-IN")} people a day: {limit.today} go today, the rest over the next {limit.days - 1}{" "}
          {limit.days - 1 === 1 ? "day" : "days"}.
        </p>
      ) : null}
      {p.sample ? (
        <div>
          <span className="eyebrow block">What the first person reads</span>
          <p className="text-ink m-0 mt-1 whitespace-pre-wrap">{p.sample}</p>
        </div>
      ) : null}
    </div>
  );
}
