"use client";

import * as React from "react";
import { HistoryIcon, KeyRoundIcon, Loader2Icon, PlusIcon, RotateCcwIcon, SendIcon, Trash2Icon, WebhookIcon } from "lucide-react";
import { formatDateTime, relativeTime } from "@moa/app-kit";
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
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Notice,
  Segmented,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  Switch,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useApiKeys, useCreateEndpoint, useDeleteEndpoint, useDeliveries, useEndpoints, useRetryDelivery, useRotateEndpointSecret, useTestEndpoint, useUpdateEndpoint, useWebhookStatus } from "../queries";
import {
  EMPTY_ENDPOINT_FORM,
  EVENT_TYPE_GROUPS,
  KEY_MODES,
  deliveryBadge,
  endpointBody,
  endpointHealth,
  endpointNoticeText,
  eventTypeLabel,
  eventsSummary,
  keyStatus,
  webhookUrlProblem,
  type Delivery,
  type Endpoint,
  type EndpointForm,
  type EndpointWithSecret,
} from "../schemas";
import { NoticeTick, SecretOnce } from "./parts";

const field = "input h-10 w-full";

/**
 * Webhook endpoints: addresses of the club's own systems that MyOtherApp
 * tells about changes as they happen, from wherever they were made (the
 * dashboard, the app, the website, the API). Each change is signed with the
 * endpoint's secret, shown once; failures are retried for a day, and an
 * endpoint failing three days running is turned off and the owner emailed.
 */
export function WebhooksPanel() {
  const status = useWebhookStatus();
  const endpoints = useEndpoints();
  const [adding, setAdding] = React.useState(false);
  const [shown, setShown] = React.useState<{ made: EndpointWithSecret; rotated: boolean } | null>(null);
  const [log, setLog] = React.useState<Endpoint | null>(null);
  const list = endpoints.data ?? [];
  // Webhooks can't be used right now (MyOtherApp hasn't their signing key set up): say so, and make nothing new.
  const off = status.data != null && !status.data.available;
  const full = status.data?.max_endpoints != null && list.length >= status.data.max_endpoints;

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Webhook endpoints">
      <CardLabel
        right={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)} disabled={off || full}>
            <PlusIcon className="size-3.5" /> Add endpoint
          </button>
        }
      >
        Webhook endpoints
      </CardLabel>
      <p className="text-ink-3 m-0 text-[12.5px] leading-[1.5]">
        We send each change to these addresses as it happens: a new registration, a check-in, an event published. Each one is signed, so your system can tell it came from us.
      </p>
      {off ? (
        <Notice tone="caution" tag="Not now">
          {status.data?.message ?? "Webhooks can't be used right now."}
        </Notice>
      ) : full ? (
        <Notice tone="caution" tag="Limit">
          Your club has {status.data!.max_endpoints} endpoints, the most it may have. Remove one to add another.
        </Notice>
      ) : null}
      {endpoints.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : endpoints.isError ? (
        <Notice tone="refuse" tag="Webhooks">
          We couldn&apos;t load your endpoints. Try reloading the page.
        </Notice>
      ) : list.length === 0 ? (
        <EmptyState size="sm" tone="muted" icon={<WebhookIcon />} title="No endpoints yet" description="Add your system's address to hear about registrations, check-ins and event changes as they happen." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.map((e) => (
            <EndpointRow key={e.id} e={e} onLog={() => setLog(e)} onRotated={(made) => setShown({ made, rotated: true })} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddEndpointDialog
          onClose={() => setAdding(false)}
          onCreated={(made) => {
            setAdding(false);
            setShown({ made, rotated: false });
          }}
        />
      ) : null}
      {shown ? (
        <Dialog open onOpenChange={(open) => !open && setShown(null)}>
          <DialogContent className="sm:max-w-[560px]" onInteractOutside={(ev) => ev.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{shown.rotated ? "New signing secret" : "Endpoint added"}</DialogTitle>
              <DialogDescription>
                {shown.rotated
                  ? "Changes are signed with this secret from now on. The old one still signs them too for a day, so your system can switch over."
                  : "Check each change's MOA-Signature header with this secret before trusting it. Send a test to see one arrive."}
              </DialogDescription>
            </DialogHeader>
            <SecretOnce label="Signing secret" secret={shown.made.secret}>
              <p className="text-ink-3 m-0 font-mono text-[12px] break-all">{shown.made.endpoint.url}</p>
            </SecretOnce>
            <DialogFooter>
              <button type="button" className="btn btn-primary" onClick={() => setShown(null)}>
                I&apos;ve copied it
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <DeliveryLog endpoint={log} onClose={() => setLog(null)} />
    </FigurePanel>
  );
}

const HEALTH_BADGE = {
  ok: { label: "Working", tone: "success" },
  new: { label: "Nothing sent yet", tone: "info" },
  failing: { label: "Failing", tone: "destructive" },
  off: { label: "Off", tone: "default" },
} as const;

function EndpointRow({ e, onLog, onRotated }: { e: Endpoint; onLog: () => void; onRotated: (made: EndpointWithSecret) => void }) {
  const update = useUpdateEndpoint();
  const test = useTestEndpoint();
  const rotate = useRotateEndpointSecret();
  const remove = useDeleteEndpoint();
  const [asking, setAsking] = React.useState<"delete" | "rotate" | null>(null);
  const health = endpointHealth(e);
  const [now] = React.useState(() => new Date());
  // One a partner app made for the club: shown, but that app manages it.
  const byPartner = e.byPartner;

  return (
    <li className="border-line-soft flex flex-col gap-2 border-b py-3 last:border-0" aria-label={e.url}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink font-mono text-[13px] break-all">{e.url}</span>
            <StatusBadge label={HEALTH_BADGE[health].label} tone={HEALTH_BADGE[health].tone} />
            {e.livemode ? null : <span className="tag text-caution">Test</span>}
          </div>
          {e.description ? <p className="text-ink-2 m-0 mt-0.5 text-[12.5px]">{e.description}</p> : null}
          <p className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
            {eventsSummary(e.events)}
            {e.share_attendee_details ? " · with people's details" : ""}
            {e.include_own_changes ? " · including your own API changes" : ""}
            {byPartner ? " · added by a connected app" : ""}
            {e.lastSentAt ? (
              <>
                {" · last sent "}
                <time dateTime={e.lastSentAt} title={formatDateTime(e.lastSentAt)}>
                  {relativeTime(e.lastSentAt, now)}
                </time>
                {e.lastSentAt === e.last_failure_at ? " (failed)" : ""}
              </>
            ) : null}
            {e.secret_hint ? (
              <>
                {" · secret "}
                <span className="font-mono">{e.secret_hint}</span>
              </>
            ) : null}
          </p>
        </div>
        <Switch
          checked={e.enabled}
          disabled={update.isPending || byPartner}
          onCheckedChange={(next) => update.mutate({ endpoint: e, body: { enabled: next } })}
          aria-label={e.enabled ? `Turn off ${e.url}` : `Turn on ${e.url}`}
        />
      </div>
      {health === "failing" ? (
        <Notice tone="caution" tag="Retrying">
          It has been failing since {formatDateTime(e.failing_since!)}
          {e.consecutive_failures ? `, ${e.consecutive_failures} times in a row` : ""}. We keep retrying each change for a day; after three days of failures it is turned off and the club&apos;s
          owner is emailed.
        </Notice>
      ) : !e.enabled && e.disabled_reason === "failing" ? (
        <Notice tone="refuse" tag="Turned off">
          We turned it off after three days of failures. Fix your endpoint, send a test, then turn it on again.
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => test.mutate(e.id)} disabled={test.isPending || byPartner}>
          {test.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <SendIcon className="size-3" />} Send test
        </button>
        <button type="button" className="btn btn-secondary btn-xs" onClick={onLog}>
          <HistoryIcon className="size-3" /> Delivery log
        </button>
        {byPartner ? null : (
          <>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAsking("rotate")} disabled={rotate.isPending}>
              <KeyRoundIcon className="size-3" /> New secret
            </button>
            <button type="button" className="btn btn-ghost btn-danger btn-xs" onClick={() => setAsking("delete")} disabled={remove.isPending}>
              <Trash2Icon className="size-3" /> Remove
            </button>
          </>
        )}
      </div>
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking === "rotate" ? "Make a new signing secret?" : "Remove this endpoint?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {asking === "rotate"
                ? "The new secret is shown once. Changes are signed with it from now on; the old one still signs them too for a day, while your system switches over."
                : "Nothing more is sent to it, and its delivery log goes with it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(asking === "delete" && buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                const what = asking;
                setAsking(null);
                if (what === "delete") remove.mutate(e.id);
                else rotate.mutate(e.id, { onSuccess: onRotated });
              }}
            >
              {asking === "rotate" ? "Make a new secret" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AddEndpointDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (made: EndpointWithSecret) => void }) {
  const create = useCreateEndpoint();
  const keys = useApiKeys();
  const [form, setForm] = React.useState<EndpointForm>(EMPTY_ENDPOINT_FORM);
  const [tried, setTried] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const urlProblem = webhookUrlProblem(form.url);
  const eventsProblem = !form.all && form.events.length === 0 ? "Choose at least one kind of change, or All." : null;
  const noticeProblem = form.shareDetails && !form.noticeTicked ? "Tick this to send people's details, or untick Send people's details." : null;
  // The club's live keys of the same mode, by name: the one this system uses, so its own changes don't come back.
  const ownKeys = (keys.data ?? []).filter((k) => keyStatus(k, now) === "active" && k.client_id && k.mode === form.mode);
  const set = <K extends keyof EndpointForm>(key: K, value: EndpointForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (type: string, on: boolean) => set("events", on ? [...form.events.filter((t) => t !== type), type] : form.events.filter((t) => t !== type));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (urlProblem || eventsProblem || noticeProblem) return;
    create.mutate(endpointBody(form), { onSuccess: onCreated });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add a webhook endpoint</DialogTitle>
          <DialogDescription>An https address on your system. It should answer with a 2xx within 10 seconds.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="hook-url" className="eyebrow mb-1.5 block">
              Address
            </label>
            <input
              id="hook-url"
              className={cn(field, "font-mono text-[13px]")}
              value={form.url}
              inputMode="url"
              placeholder="https://erp.example.edu/moa/webhooks"
              onChange={(ev) => set("url", ev.target.value)}
              aria-invalid={tried && urlProblem ? true : undefined}
              aria-describedby={tried && urlProblem ? "hook-url-error" : undefined}
            />
            {tried && urlProblem ? (
              <p id="hook-url-error" className="text-refuse m-0 mt-1 text-[12px]">
                {urlProblem}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="hook-description" className="eyebrow mb-1.5 block">
              Note (optional)
            </label>
            <input id="hook-description" className={field} value={form.description} maxLength={200} placeholder="Our registrations sheet" onChange={(ev) => set("description", ev.target.value)} />
          </div>
          <div>
            <span className="eyebrow mb-1.5 block">Changes to</span>
            <Segmented
              label="Changes to"
              className="sm:max-w-[360px]"
              value={form.mode}
              options={KEY_MODES.map((m) => ({ value: m, label: m === "live" ? "Live events" : "Test events" }))}
              onChange={(m) => setForm((f) => ({ ...f, mode: m, keyClientId: "" }))}
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="eyebrow mb-1.5 p-0">What to send</legend>
            <Segmented
              label="What to send"
              className="sm:max-w-[320px]"
              value={form.all ? "all" : "some"}
              options={[
                { value: "all", label: "All changes" },
                { value: "some", label: "Only some" },
              ]}
              onChange={(v) => set("all", v === "all")}
            />
            {form.all ? (
              <p className="text-ink-3 m-0 text-[12px]">Every kind of change, including ones added later.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {EVENT_TYPE_GROUPS.map((g) => (
                  <div key={g.label} role="group" aria-label={g.label} className="border-line-soft rounded-xl border p-2.5">
                    <div className="text-ink-2 mb-1 text-[12px] font-semibold">{g.label}</div>
                    {g.types.map((t) => {
                      const id = `hook-${t.key.replace(/\./g, "-")}`;
                      return (
                        <div key={t.key} className="flex items-center gap-2 py-1">
                          <Checkbox id={id} checked={form.events.includes(t.key)} onCheckedChange={(next) => toggle(t.key, next === true)} />
                          <label htmlFor={id} className="text-ink cursor-pointer text-[12.5px]">
                            {t.label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {tried && eventsProblem ? (
              <p role="alert" className="text-refuse m-0 text-[12px]">
                {eventsProblem}
              </p>
            ) : null}
          </fieldset>
          <div>
            <label htmlFor="hook-key" className="eyebrow mb-1.5 block">
              The API key this system uses (optional)
            </label>
            <NativeSelect id="hook-key" className="h-10 w-full" value={form.keyClientId} onChange={(ev) => setForm((f) => ({ ...f, keyClientId: ev.target.value, includeOwn: false }))}>
              <option value="">None: send every change</option>
              {ownKeys.map((k) => (
                <option key={k.id} value={k.client_id!}>
                  {k.name} ({k.prefix}…)
                </option>
              ))}
            </NativeSelect>
            <p className="text-ink-3 m-0 mt-1 text-[12px] leading-[1.5]">Changes your system makes with that key aren&apos;t sent back to it, so the two sides don&apos;t go round in a loop.</p>
          </div>
          {form.keyClientId ? (
            <div className="flex items-start gap-3">
              <Checkbox id="hook-own" checked={form.includeOwn} onCheckedChange={(next) => set("includeOwn", next === true)} className="mt-0.5" />
              <label htmlFor="hook-own" className="text-ink cursor-pointer text-[13px] font-medium">
                Send its own changes back too
              </label>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <Checkbox id="hook-share" checked={form.shareDetails} onCheckedChange={(next) => set("shareDetails", next === true)} className="mt-0.5" />
              <div>
                <label htmlFor="hook-share" className="text-ink cursor-pointer text-[13px] font-medium">
                  Send people&apos;s details
                </label>
                <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">Names, emails, phone numbers and answers go with each registration and check-in. Off, only ids and statuses do.</p>
              </div>
            </div>
            {form.shareDetails ? (
              <NoticeTick id="hook-notice" recipient="" text={endpointNoticeText(form.url)} checked={form.noticeTicked} onChange={(next) => set("noticeTicked", next)} error={tried ? (noticeProblem ?? undefined) : undefined} />
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />} Add endpoint
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** An endpoint's deliveries, newest first, each with its attempts and what came back; any can be sent again. */
function DeliveryLog({ endpoint, onClose }: { endpoint: Endpoint | null; onClose: () => void }) {
  const [failedOnly, setFailedOnly] = React.useState(false);
  const q = useDeliveries(endpoint?.id ?? null, failedOnly ? "failed" : undefined);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Sheet open={endpoint !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>Delivery log</SheetTitle>
          <SheetDescription className="font-mono break-all">{endpoint?.url}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="flex gap-2">
            <Chip active={!failedOnly} onClick={() => setFailedOnly(false)}>
              All
            </Chip>
            <Chip active={failedOnly} tone="refuse" onClick={() => setFailedOnly(true)}>
              Failed
            </Chip>
          </div>
          <p className="text-ink-3 m-0 text-[12px]">Kept for 30 days. Sending one again uses the same event id, so your system can tell it already had it.</p>
          {q.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : q.isError ? (
            <Notice tone="refuse" tag="Log">
              We couldn&apos;t load the log. Try again in a moment.
            </Notice>
          ) : items.length === 0 ? (
            <EmptyState size="sm" tone="muted" title={failedOnly ? "Nothing failed" : "Nothing sent yet"} description={failedOnly ? undefined : "Send a test to see one here."} />
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {items.map((d) => (
                <DeliveryRow key={d.id} d={d} endpointId={endpoint!.id} canReplay={!endpoint!.byPartner && endpoint!.enabled} />
              ))}
            </ul>
          )}
          {q.hasNextPage ? (
            <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Show older
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeliveryRow({ d, endpointId, canReplay }: { d: Delivery; endpointId: string; canReplay: boolean }) {
  const retry = useRetryDelivery(endpointId);
  const badge = deliveryBadge(d.status);
  return (
    <li className="border-line-soft flex flex-col gap-1 border-b py-2.5 last:border-0" aria-label={`${eventTypeLabel(d.type)}, ${badge.label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <span className="text-ink text-[13px] font-medium">{eventTypeLabel(d.type)}</span>
        {d.test ? <span className="tag">Test</span> : null}
        <span className="flex-1" />
        {canReplay ? (
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => retry.mutate(d.id)} disabled={retry.isPending || d.status === "pending"}>
            {retry.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <RotateCcwIcon className="size-3" />} Send again
          </button>
        ) : null}
      </div>
      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        <code className="font-mono">{d.type}</code>
        {d.created_at ? ` · ${formatDateTime(d.created_at)}` : ""}
        {` · ${d.attempts} ${d.attempts === 1 ? "attempt" : "attempts"}`}
        {d.response_status ? ` · answered ${d.response_status}` : d.status === "failed" ? " · no answer" : ""}
        {d.duration_ms !== null && d.duration_ms !== undefined ? ` · ${d.duration_ms} ms` : ""}
        {d.next_attempt_at && d.status === "retrying" ? ` · next try ${formatDateTime(d.next_attempt_at)}` : ""}
      </p>
      {d.error ? <p className="text-refuse m-0 text-[12px] break-words">{d.error}</p> : null}
      {d.event_id ? <p className="text-ink-3 m-0 font-mono text-[11px]">{d.event_id}</p> : null}
    </li>
  );
}
