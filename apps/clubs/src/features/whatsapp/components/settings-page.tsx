"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, Loader2Icon, MessageCircleIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
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
  Switch,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { isPlanLockError } from "@/features/plan";

import {
  forbiddenText,
  isPermissionError,
  isPrivateError,
  keysErrorMessage,
  useAccount,
  useDisconnectAccount,
  useOverview,
  useSaveAccount,
  useUpdateAccount,
  useVerifyAccount,
  type KeysProblem,
} from "../queries";
import { META_STEPS, STATUS_LABEL, STATUS_TONE, WEBHOOK_STEPS, keysSchema, tierWords, type Account, type KeyField, type Keys } from "../schemas";
import { OverviewFigures } from "./overview-card";
import { CopyRow, Field, NoAccessPanel, QualityBadge, Step, UpgradeNotice, When, WhatsAppHeader } from "./shared";

/**
 * WhatsApp settings: the club's own WhatsApp Business number.
 *
 * Enterprise. The club pastes four things from its own Meta app (and,
 * optionally, the app ID); the server checks them with Meta before keeping
 * them, and the token and app secret are never shown again. Step 2 is the
 * webhook, which the page keeps lit until Meta's first delivery arrives.
 *
 * The owner and admins manage it (`can_manage`); a member with the WhatsApp
 * permission sees it read-only; anyone else gets a calm panel (403
 * WHATSAPP_PERMISSION). On a plan without it the page says which plan has
 * it; a number connected before a downgrade stays visible.
 */
export function WhatsAppSettingsPage() {
  const q = useAccount();
  const a = q.data;

  return (
    <div className="flex flex-col gap-3.5">
      <WhatsAppHeader title="WhatsApp" sub="Your club's own WhatsApp Business number" />

      {q.isError && (isPermissionError(q.error) || isPrivateError(q.error)) ? (
        <NoAccessPanel title="WhatsApp isn't open to you" body={forbiddenText(q.error)} />
      ) : q.isError ? (
        <EmptyState tone="muted" title="Could not load your WhatsApp settings" description="Try reloading the page." />
      ) : !a ? (
        <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[280px] rounded-2xl" />
          <Skeleton className="h-[280px] rounded-2xl" />
        </div>
      ) : !a.available ? (
        <Notice tone="neutral" tag="WhatsApp">
          Your own WhatsApp number isn&apos;t available yet — tickets and reminders go out from MyOtherApp&apos;s number.
        </Notice>
      ) : (
        <>
          {!a.plan_allows ? <UpgradeNotice upgrade={a.upgrade} /> : null}
          {a.plan_allows && !a.can_manage ? (
            <Notice tone="neutral" tag="Read only">
              Only the club&apos;s owner and its admins can connect or change the WhatsApp number. You can see how it&apos;s set up.
            </Notice>
          ) : null}
          <div className="grid items-start gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex min-w-0 flex-col gap-3.5">
              {a.connected ? <Connected a={a} /> : <NotConnected a={a} />}
              {a.connected ? <ConnectedOverview /> : null}
              {a.connected ? <WebhookSetup a={a} /> : null}
              {a.connected ? <Behaviour a={a} /> : null}
            </div>
            <Help />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Not connected ───────────────────────────────────────────────────────

function NotConnected({ a }: { a: Account }) {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your WhatsApp number">
      <CardLabel right={<StatusBadge label={a.status === "disconnected" ? "Disconnected" : "Not connected"} />}>Your WhatsApp number</CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
          <MessageCircleIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">Talk to attendees from your own number</h3>
          <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
            Connect your club&apos;s WhatsApp Business number to answer attendees and followers from the dashboard, send your tickets and reminders from it, and
            see how Meta rates it. Your club pays Meta for what the number sends.
          </p>
        </div>
      </div>

      <div className="bg-sunken rounded-xl p-3">
        <span className="eyebrow block">What you need</span>
        <ul className="text-ink-2 m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
          <li>A Meta app with WhatsApp added, and your number verified in it</li>
          <li>A system user&apos;s permanent access token, the WhatsApp Business Account ID, the phone number ID and the app secret (see Help)</li>
        </ul>
      </div>

      {a.can_manage && a.plan_allows ? (
        <KeysForm />
      ) : a.can_manage ? null : (
        <p className="text-ink-3 m-0 text-[12.5px]">Only the club&apos;s owner and its admins can connect one.</p>
      )}
    </FigurePanel>
  );
}

const field = "input h-10 w-full font-mono";
const EMPTY: Keys = { waba_id: "", phone_number_id: "", access_token: "", app_secret: "", app_id: "" };

/** The keys. Saving has the server check them with Meta first; its refusals show on the field they're about. */
export function KeysForm({ replacing = false, onDone, initial }: { replacing?: boolean; onDone?: () => void; initial?: Partial<Keys> }) {
  const save = useSaveAccount();
  const form = useForm<Keys>({ resolver: zodResolver(keysSchema), defaultValues: { ...EMPTY, ...initial } });
  const { errors } = form.formState;
  const [problem, setProblem] = React.useState<KeysProblem | null>(null);
  const busy = save.isPending || form.formState.isSubmitting;

  const submit = async (values: Keys) => {
    setProblem(null);
    try {
      const next = await save.mutateAsync(values);
      // The token and secret leave the page with the save: never shown again.
      form.reset({ ...EMPTY, ...initial, access_token: "", app_secret: "" });
      toast.success(next.status === "active" ? `Connected ${next.display_phone_number ?? "your number"}.` : "Keys saved.");
      onDone?.();
    } catch (error) {
      if (isPlanLockError(error)) return;
      const p = keysErrorMessage(error);
      setProblem(p);
      if (p.field) form.setError(p.field, { message: p.text });
    }
  };

  const err = (name: KeyField) => errors[name]?.message ?? null;
  const input = (name: KeyField, id: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={id}
      autoComplete="off"
      spellCheck={false}
      className={field}
      disabled={busy}
      aria-invalid={Boolean(errors[name]) || undefined}
      aria-describedby={errors[name] ? `${id}-error` : undefined}
      {...extra}
      {...form.register(name)}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-3" aria-label={replacing ? "Replace keys" : "Connect WhatsApp"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="wa-waba-id" label="WhatsApp Business Account ID" error={err("waba_id")}>
          {input("waba_id", "wa-waba-id", { inputMode: "numeric" })}
        </Field>
        <Field id="wa-phone-id" label="Phone number ID" error={err("phone_number_id")}>
          {input("phone_number_id", "wa-phone-id", { inputMode: "numeric" })}
        </Field>
      </div>
      <Field id="wa-token" label="Access token" error={err("access_token")} help="A system user's permanent token. Never shown again once saved.">
        {input("access_token", "wa-token", { type: "password", autoComplete: "new-password" })}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="wa-secret" label="App secret" error={err("app_secret")} help="Proves Meta's webhooks are from your app.">
          {input("app_secret", "wa-secret", { type: "password", autoComplete: "new-password" })}
        </Field>
        <Field id="wa-app-id" label="App ID (optional)" error={err("app_id")} help="Needed to submit templates with a document, like tickets.">
          {input("app_id", "wa-app-id", { inputMode: "numeric" })}
        </Field>
      </div>

      {problem && !problem.field ? (
        <Notice tone="refuse" tag="Not saved">
          {problem.text}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />}{" "}
          {busy ? "Checking with Meta…" : replacing ? "Save new keys" : "Connect WhatsApp"}
        </button>
        {replacing ? (
          <button type="button" className="btn btn-ghost" onClick={onDone} disabled={busy}>
            Keep current keys
          </button>
        ) : null}
      </div>
    </form>
  );
}

// ─── Connected ───────────────────────────────────────────────────────────

function toastRefusal(error: unknown) {
  if (isPlanLockError(error)) return;
  toast.error(keysErrorMessage(error).text);
}

function Connected({ a }: { a: Account }) {
  const verify = useVerifyAccount();
  const disconnect = useDisconnectAccount();
  const [replacing, setReplacing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const status = a.status ?? "active";
  const busy = verify.isPending || disconnect.isPending;

  const checkAgain = () =>
    verify.mutate(undefined, {
      onSuccess: (next) => {
        if (next.status === "active") toast.success("Checked. Meta accepts the keys.");
        else toast.error("Meta refused the number. See what it said on the page.");
      },
      onError: toastRefusal,
    });

  const confirmDisconnect = () => {
    setConfirming(false);
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success("Disconnected. The keys are wiped; tickets go out from MyOtherApp's number."),
      onError: toastRefusal,
    });
  };

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your WhatsApp number">
      <CardLabel right={<StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />}>Your WhatsApp number</CardLabel>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", status === "active" ? "bg-admit-soft text-admit" : "bg-sunken text-ink-2")}>
          <MessageCircleIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">{a.display_phone_number ?? "Your number"}</h3>
          <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
            {a.verified_name ? `${a.verified_name} · ` : ""}
            {status === "active" ? "Connected and working." : "Meta refused it on the last check: nothing goes out from it until it's fixed."}
          </p>
        </div>
        <QualityBadge rating={a.quality_rating} />
      </div>

      <dl className="m-0 grid gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-[max-content_1fr]">
        <dt className="eyebrow sm:pt-0.5">Messaging limit</dt>
        <dd className="text-ink m-0">{tierWords(a.messaging_limit_tier)}</dd>
        <dt className="eyebrow sm:pt-0.5">Business Account ID</dt>
        <dd className="text-ink m-0 font-mono break-all">{a.waba_id ?? "—"}</dd>
        <dt className="eyebrow sm:pt-0.5">Phone number ID</dt>
        <dd className="text-ink m-0 font-mono break-all">{a.phone_number_id ?? "—"}</dd>
        <dt className="eyebrow sm:pt-0.5">Access token</dt>
        <dd className="text-ink m-0 font-mono">{a.token_last4 ? `ends …${a.token_last4}` : "—"}</dd>
        <dt className="eyebrow sm:pt-0.5">Checked with Meta</dt>
        <dd className="text-ink m-0">
          <When iso={a.verified_at} fallback="Not yet" />
        </dd>
        <dt className="eyebrow sm:pt-0.5">Quality last read</dt>
        <dd className="text-ink m-0">
          <When iso={a.quality_checked_at} fallback="Not yet" />
        </dd>
      </dl>

      {a.last_error ? (
        <Notice tone={status === "failed" ? "refuse" : "caution"} tag="Meta">
          {a.last_error}
          {a.last_error_code ? ` (${a.last_error_code})` : ""}
          {status === "failed" ? (a.can_manage ? " Fix it in Meta and click Check again, or paste new keys." : " The club's owner or an admin can fix it.") : ""}
        </Notice>
      ) : null}

      {a.can_manage && replacing ? (
        <div className="border-line-soft border-t pt-3">
          <p className="text-ink-2 m-0 mb-2.5 text-[12.5px]">Paste the new keys. The webhook address and verify token stay the same.</p>
          <KeysForm replacing onDone={() => setReplacing(false)} initial={{ waba_id: a.waba_id ?? "", phone_number_id: a.phone_number_id ?? "", app_id: a.app_id ?? "" }} />
        </div>
      ) : null}

      {a.can_manage && !replacing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={checkAgain} disabled={busy}>
            {verify.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />} Check again
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplacing(true)} disabled={busy}>
            <KeyRoundIcon className="size-3.5" /> Replace keys
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setConfirming(true)} disabled={busy}>
            {disconnect.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnplugIcon className="size-3.5" />} Disconnect
          </button>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your WhatsApp number?</AlertDialogTitle>
            <AlertDialogDescription>
              The access token and app secret are wiped from MyOtherApp. Nothing more is sent from the number, and tickets go out from MyOtherApp&apos;s number
              again. The inbox keeps its messages until your retention period ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={confirmDisconnect}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

function ConnectedOverview() {
  const q = useOverview(7);
  if (!q.data) return null;
  return <OverviewFigures o={q.data} />;
}

// ─── Step 2: the webhook ─────────────────────────────────────────────────

function WebhookSetup({ a }: { a: Account }) {
  const todo = !a.last_webhook_at;
  const after = WEBHOOK_STEPS.length;
  return (
    <FigurePanel className={cn("flex flex-col gap-3 p-4", todo && "ring-brand ring-2")} role="region" aria-label="Step 2: the webhook" data-todo={todo || undefined}>
      <CardLabel right={todo ? <StatusBadge label="To do" tone="warning" /> : <StatusBadge label="Messages arriving" tone="success" />}>Step 2</CardLabel>
      <div>
        <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">Point your app&apos;s webhook here</h3>
        <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
          So Meta passes on what people send your number, and whether your messages were delivered and read.{" "}
          {a.last_webhook_at ? (
            <>
              Last delivery from Meta: <When iso={a.last_webhook_at} />.
            </>
          ) : (
            "Nothing has arrived from Meta yet."
          )}
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[13px]">
        {WEBHOOK_STEPS.map((text, i) => (
          <Step key={text} n={i + 1}>
            {text}
            {i === 1 ? (
              <>
                <CopyRow label="Callback URL" value={a.webhook_url} hidden="Not given yet — click Check again." />
                <CopyRow label="Verify token" value={a.verify_token} hidden={a.can_manage ? "Not given yet — click Check again." : "Only the club's owner and admins can see it."} />
              </>
            ) : null}
            {i === 2 ? (
              a.webhook_fields.length ? (
                <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="Webhook fields">
                  {a.webhook_fields.map((f) => (
                    <li key={f} className="tag font-mono">
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null
            ) : null}
          </Step>
        ))}
        <Step n={after + 1}>Send your number a message from your own phone: it should appear in the inbox within seconds.</Step>
      </ol>
    </FigurePanel>
  );
}

// ─── Routing and retention ───────────────────────────────────────────────

const RETENTION = [3, 6, 12, 24, 36] as const;

function Behaviour({ a }: { a: Account }) {
  const update = useUpdateAccount();
  const change = (body: { routing?: boolean; retention_months?: number }, done: string) =>
    update.mutate(body, { onSuccess: () => toast.success(done), onError: toastRefusal });
  const months = RETENTION.includes(a.retention_months as (typeof RETENTION)[number]) ? RETENTION : [...RETENTION, a.retention_months].sort((x, y) => x - y);
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="What the number does">
      <CardLabel>What the number does</CardLabel>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="wa-routing" className="text-ink text-[13.5px] font-medium">
            Send tickets, certificates and reminders from this number
          </label>
          <p className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
            Once your account has MyOtherApp&apos;s ticket, reminder and certificate templates approved (see Templates). Anything your number can&apos;t send goes
            from MyOtherApp&apos;s number instead.
          </p>
        </div>
        <Switch
          id="wa-routing"
          checked={a.routing}
          disabled={!a.can_manage || update.isPending}
          onCheckedChange={(on) => change({ routing: on }, on ? "Tickets will go from your number." : "Tickets will go from MyOtherApp's number.")}
        />
      </div>
      <div className="border-line-soft flex flex-wrap items-center gap-3 border-t pt-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="wa-retention" className="text-ink text-[13.5px] font-medium">
            Keep messages for
          </label>
          <p className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">Older messages are deleted from the inbox for good.</p>
        </div>
        <NativeSelect
          id="wa-retention"
          size="sm"
          className="w-[140px]"
          value={String(a.retention_months)}
          disabled={!a.can_manage || update.isPending}
          onChange={(e) => change({ retention_months: Number(e.target.value) }, "Retention saved.")}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m} months
            </option>
          ))}
        </NativeSelect>
      </div>
    </FigurePanel>
  );
}

// ─── Help ───────────────────────────────────────────────────────────────

function Help() {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Help">
      <CardLabel>Help</CardLabel>
      <section>
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Setting up your Meta app</h4>
        <ol className="text-ink-2 m-0 mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
          {META_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="border-line-soft border-t pt-3">
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Quality and limits</h4>
        <p className="text-ink-2 m-0 mt-1 text-[12.5px] leading-[1.5]">
          Meta rates your number High, Medium or Low from how people react to it: blocks and reports bring it down. The messaging limit is how many people your
          number may start conversations with a day; it grows as you send good messages. We check both every few hours and tell you if they drop.
        </p>
      </section>
      <section className="border-line-soft border-t pt-3">
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">The 24-hour window</h4>
        <p className="text-ink-2 m-0 mt-1 text-[12.5px] leading-[1.5]">
          After someone writes to you, you can reply with anything for 24 hours. After that, WhatsApp only delivers templates Meta approved.
        </p>
      </section>
    </FigurePanel>
  );
}
