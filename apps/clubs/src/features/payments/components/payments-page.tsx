"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CopyIcon, KeyRoundIcon, LandmarkIcon, Loader2Icon, MailIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
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
  EmptyState,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { SALES_EMAIL, mailto } from "@/features/billing/schemas";

import { gatewayErrorMessage, useDisconnectGateway, useGateway, useSaveGateway, useVerifyGateway, type KeysProblem } from "../queries";
import { KEY_STEPS, STATUS_LABEL, STATUS_TONE, WEBHOOK_STEPS, gatewayKeysSchema, hasAccount, type Gateway, type GatewayKeys } from "../schemas";

/**
 * Payments: where the club's ticket money goes.
 *
 * Without an account of its own, a club's paid events take payments through
 * MyOtherApp's Razorpay, as they always have. Connecting the club's own
 * Razorpay (its live API keys) sends new payments straight to the club's
 * bank account. Step 2 tells Razorpay where to send its payment notices
 * (the webhook), and the page keeps that step lit until the first arrives.
 *
 * Only the club's own account may connect, check, replace or disconnect
 * (the server's `can_manage`, and 403 OWNER_ONLY behind it). Team members
 * see the same page without its buttons.
 */
export function PaymentsPage() {
  const q = useGateway();
  const g = q.data;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="min-w-0">
        <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Payments</h2>
        <p className="text-ink-2 mt-1 text-[13px]">Where the money from your paid events goes</p>
      </header>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load your payment settings" description="Try reloading the page." />
      ) : !g ? (
        <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[260px] rounded-2xl" />
          <Skeleton className="h-[260px] rounded-2xl" />
        </div>
      ) : !g.available ? (
        <Notice tone="neutral" tag="Payments">
          Own Razorpay isn&apos;t available yet — your ticket payments go through MyOtherApp.
        </Notice>
      ) : (
        <>
          {!g.can_manage ? (
            <Notice tone="neutral" tag="Read only">
              Only the club&apos;s own account can connect or change the Razorpay account. You can see how it&apos;s set up.
            </Notice>
          ) : null}
          <div className="grid items-start gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex min-w-0 flex-col gap-3.5">
              {hasAccount(g) ? <Connected g={g} /> : <NotConnected g={g} />}
              {hasAccount(g) && g.status !== "disabled" ? <WebhookSetup g={g} /> : null}
            </div>
            <Help />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Not connected ───────────────────────────────────────────────────────

function NotConnected({ g }: { g: Gateway }) {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your Razorpay">
      <CardLabel right={<StatusBadge label="Not connected" />}>Your Razorpay</CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
          <LandmarkIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">Receive ticket payments in your own account</h3>
          <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
            Payments for your paid events currently go through MyOtherApp&apos;s Razorpay account. Connect your own to receive them directly in your bank account.
          </p>
        </div>
      </div>

      <div className="bg-sunken rounded-xl p-3">
        <span className="eyebrow block">What you need</span>
        <ul className="text-ink-2 m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
          <li>A Razorpay account with its KYC done</li>
          <li>Its Live mode API keys — the Key ID and the Key secret (see Help for where to find them)</li>
        </ul>
      </div>

      {g.can_manage ? <KeysForm /> : <p className="text-ink-3 m-0 text-[12.5px]">Only the club&apos;s own account can connect one.</p>}
    </FigurePanel>
  );
}

const field = "input h-10 w-full font-mono";

/** The two live keys. Saving has the server check them with Razorpay first; its refusals show here. */
function KeysForm({ replacing = false, onDone }: { replacing?: boolean; onDone?: () => void }) {
  const save = useSaveGateway();
  const form = useForm<GatewayKeys>({ resolver: zodResolver(gatewayKeysSchema), defaultValues: { key_id: "", key_secret: "" } });
  const { errors } = form.formState;
  const [problem, setProblem] = React.useState<KeysProblem | null>(null);
  const busy = save.isPending || form.formState.isSubmitting;

  const submit = async (values: GatewayKeys) => {
    setProblem(null);
    try {
      const next = await save.mutateAsync(values);
      // The secret leaves the page with the save: it is never shown again.
      form.reset({ key_id: "", key_secret: "" });
      toast.success(next.status === "active" ? "Razorpay connected. New ticket payments go to your account." : "Keys saved.");
      onDone?.();
    } catch (error) {
      setProblem(gatewayErrorMessage(error));
    }
  };

  const idInvalid = Boolean(errors.key_id) || problem?.field === "key_id" || problem?.field === "keys";
  const secretInvalid = Boolean(errors.key_secret) || problem?.field === "keys";

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-3" aria-label={replacing ? "Replace keys" : "Connect Razorpay"}>
      <div>
        <label htmlFor="rzp-key-id" className="eyebrow mb-1.5 block">
          Key ID
        </label>
        <input
          id="rzp-key-id"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="rzp_live_…"
          className={field}
          disabled={busy}
          aria-invalid={idInvalid || undefined}
          {...form.register("key_id")}
        />
        {errors.key_id ? <p className="text-refuse mt-1 text-[12px]">{errors.key_id.message}</p> : null}
      </div>
      <div>
        <label htmlFor="rzp-key-secret" className="eyebrow mb-1.5 block">
          Key secret
        </label>
        <input
          id="rzp-key-secret"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          className={field}
          disabled={busy}
          aria-invalid={secretInvalid || undefined}
          aria-describedby="rzp-key-secret-help"
          {...form.register("key_secret")}
        />
        {errors.key_secret ? <p className="text-refuse mt-1 text-[12px]">{errors.key_secret.message}</p> : null}
        <p id="rzp-key-secret-help" className="text-ink-3 m-0 mt-1 text-[12px]">
          Never shown again once saved — not here, not anywhere in MyOtherApp.
        </p>
      </div>

      {problem ? (
        <Notice tone="refuse" tag="Not saved">
          {problem.text}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />} {busy ? "Checking with Razorpay…" : replacing ? "Save new keys" : "Connect Razorpay"}
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

function When({ iso }: { iso: string }) {
  const [now] = React.useState(() => new Date());
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso, now)}
    </time>
  );
}

function Connected({ g }: { g: Gateway }) {
  const verify = useVerifyGateway();
  const disconnect = useDisconnectGateway();
  const [replacing, setReplacing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const status = g.status ?? "active";
  const disabled = status === "disabled";
  const busy = verify.isPending || disconnect.isPending;

  const checkAgain = () =>
    verify.mutate(undefined, {
      onSuccess: (next) => {
        if (next.status === "active") toast.success(next.last_webhook_at ? "Checked. Razorpay accepts the keys and its notices are arriving." : "Checked. Razorpay accepts the keys; no payment notice has arrived yet.");
        else toast.error("Razorpay refused the keys. See what it said on the page.");
      },
      onError: (error) => toast.error(gatewayErrorMessage(error).text),
    });

  const confirmDisconnect = () => {
    setConfirming(false);
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success("Disconnected. New payments go to MyOtherApp's account."),
      onError: (error) => toast.error(gatewayErrorMessage(error).text),
    });
  };

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your Razorpay">
      <CardLabel right={<StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />}>Your Razorpay</CardLabel>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", status === "active" ? "bg-admit-soft text-admit" : "bg-sunken text-ink-2")}>
          <LandmarkIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">
            {status === "active" ? "Ticket payments go to your account" : disabled ? "Turned off by MyOtherApp" : "Razorpay refused the keys"}
          </h3>
          <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
            {status === "active"
              ? "New payments for your paid events go straight to this Razorpay account."
              : "Until this is fixed, new payments for your paid events go through MyOtherApp's account."}
          </p>
        </div>
      </div>

      <dl className="m-0 grid gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-[max-content_1fr]">
        <dt className="eyebrow sm:pt-0.5">Key ID</dt>
        <dd className="text-ink m-0 font-mono break-all">{g.key_id ?? "—"}</dd>
        <dt className="eyebrow sm:pt-0.5">Verified</dt>
        <dd className="text-ink m-0">{g.verified_at ? <When iso={g.verified_at} /> : "Not yet"}</dd>
        <dt className="eyebrow sm:pt-0.5">Last payment notice from Razorpay</dt>
        <dd className={cn("m-0", g.last_webhook_at ? "text-ink" : "text-caution font-medium")}>{g.last_webhook_at ? <When iso={g.last_webhook_at} /> : "None yet — finish step 2"}</dd>
      </dl>

      {status === "failed" ? (
        <Notice tone="refuse" tag="Razorpay">
          {g.last_error ? `Razorpay said: ${g.last_error.replace(/\.$/, "")}. ` : "Razorpay refused the keys on the last check. "}
          {g.can_manage ? "Replace the keys, or fix them in Razorpay and click Check again." : "The club's owner can replace them."}
        </Notice>
      ) : null}

      {disabled ? (
        <Notice
          tone="caution"
          tag="Disabled"
          action={
            g.can_manage ? (
              <a className="btn btn-secondary btn-sm" href={mailto("Our Razorpay connection was turned off", `Our Razorpay account (${g.key_id ?? "key"}) was disabled on MyOtherApp and we'd like to sort it out.`)}>
                <MailIcon className="size-3.5" /> Talk to us
              </a>
            ) : null
          }
        >
          MyOtherApp has turned off this connection, so new ticket payments go through MyOtherApp&apos;s account. Write to {SALES_EMAIL} to sort it out.
          {g.last_error ? ` Reason: ${g.last_error.replace(/\.$/, "")}.` : ""}
        </Notice>
      ) : null}

      {g.can_manage && replacing ? (
        <div className="border-line-soft border-t pt-3">
          <p className="text-ink-2 m-0 mb-2.5 text-[12.5px]">Paste the new live keys. The current ones keep working until Razorpay accepts these.</p>
          <KeysForm replacing onDone={() => setReplacing(false)} />
        </div>
      ) : null}

      {g.can_manage && !replacing ? (
        <div className="flex flex-wrap items-center gap-2">
          {!disabled ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={checkAgain} disabled={busy}>
                {verify.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />} Check again
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplacing(true)} disabled={busy}>
                <KeyRoundIcon className="size-3.5" /> Replace keys
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setConfirming(true)} disabled={busy}>
            {disconnect.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnplugIcon className="size-3.5" />} Disconnect
          </button>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your Razorpay?</AlertDialogTitle>
            <AlertDialogDescription>New payments will go to MyOtherApp&apos;s account. Payments already made stay in your Razorpay.</AlertDialogDescription>
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

// ─── Step 2: the webhook ─────────────────────────────────────────────────

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select it and copy by hand.");
  }
}

function CopyRow({ label, value, hidden }: { label: string; value: string | null | undefined; hidden: string }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <span className="text-ink-2 text-[12.5px]">{label}</span>
      {value ? (
        <div className="bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
          <code className="text-ink min-w-0 flex-1 text-[12.5px] break-all">{value}</code>
          <button type="button" className="btn btn-ghost btn-xs shrink-0" aria-label={`Copy the ${label.toLowerCase()}`} onClick={() => void copy(value)}>
            <CopyIcon className="size-3.5" /> Copy
          </button>
        </div>
      ) : (
        <span className="text-ink-3 text-[12.5px]">{hidden}</span>
      )}
    </div>
  );
}

function WebhookSetup({ g }: { g: Gateway }) {
  const verify = useVerifyGateway();
  // Lit until Razorpay's first notice arrives: the account takes payments, but we would not hear of them.
  const todo = !g.last_webhook_at;
  // The Dashboard steps first, then what to fill in on Razorpay's form.
  const after = WEBHOOK_STEPS.length;

  return (
    <FigurePanel className={cn("flex flex-col gap-3 p-4", todo && "ring-brand ring-2")} role="region" aria-label="Step 2: payment notices" data-todo={todo || undefined}>
      <CardLabel right={todo ? <StatusBadge label="To do" tone="warning" /> : <StatusBadge label="Notices arriving" tone="success" />}>Step 2</CardLabel>
      <div>
        <h3 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">Send Razorpay&apos;s payment notices to MyOtherApp</h3>
        <p className="text-ink-2 m-0 mt-1 text-[13px] leading-[1.55]">
          Razorpay tells MyOtherApp about each payment with a webhook, so every ticket is confirmed even when the buyer closes the page before it finishes. Set it up once:
        </p>
      </div>

      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[13px]">
        {WEBHOOK_STEPS.map((text, i) => (
          <Step key={text} n={i + 1}>
            {text}
          </Step>
        ))}
        <Step n={after + 1}>
          Fill it in:
          <CopyRow label="Webhook URL" value={g.webhook_url} hidden="Not given yet — click Check again." />
          <CopyRow label="Secret" value={g.webhook_secret} hidden={g.can_manage ? "Not given yet — click Check again." : "Only the club's own account can see it."} />
        </Step>
        <Step n={after + 2}>
          Tick these events:
          {g.webhook_events.length ? (
            <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="Events to tick">
              {g.webhook_events.map((e) => (
                <li key={e} className="tag font-mono">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-3"> the payment events Razorpay lists.</span>
          )}
        </Step>
        <Step n={after + 3}>Save the webhook in Razorpay.</Step>
      </ol>

      <div className="border-line-soft flex flex-wrap items-center gap-2 border-t pt-3">
        <p className="text-ink-2 m-0 flex-1 text-[12.5px]">Then come back and click Check again.</p>
        {g.can_manage ? (
          <button
            type="button"
            className={cn("btn btn-sm", todo ? "btn-primary" : "btn-secondary")}
            disabled={verify.isPending}
            onClick={() =>
              verify.mutate(undefined, {
                onSuccess: (next) =>
                  next.last_webhook_at
                    ? toast.success("Razorpay's notices are arriving.")
                    : toast.info("No notice from Razorpay yet. Check the webhook is saved and active; Razorpay sends one with the next payment."),
                onError: (error) => toast.error(gatewayErrorMessage(error).text),
              })
            }
          >
            {verify.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />} Check again
          </button>
        ) : null}
      </div>
    </FigurePanel>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="bg-brand-soft text-brand grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums">
        {n}
      </span>
      <div className="text-ink min-w-0 flex-1 pt-0.5 leading-[1.5]">{children}</div>
    </li>
  );
}

// ─── Help ───────────────────────────────────────────────────────────────

function Help() {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Help">
      <CardLabel>Help</CardLabel>
      <section>
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Where to get your live API keys</h4>
        <ol className="text-ink-2 m-0 mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
          {KEY_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-ink-3 m-0 mt-1.5 text-[12px]">Test mode keys (rzp_test_…) aren&apos;t accepted: they take no real money.</p>
      </section>
      <section className="border-line-soft border-t pt-3">
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Refunds and disputes</h4>
        <p className="text-ink-2 m-0 mt-1 text-[12.5px] leading-[1.5]">
          Payments made to your Razorpay account are yours: refunds and disputes for them are handled in your own Razorpay Dashboard, not by MyOtherApp.
        </p>
      </section>
      <section className="border-line-soft border-t pt-3">
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Stuck?</h4>
        <p className="text-ink-2 m-0 mt-1 text-[12.5px] leading-[1.5]">
          Write to <a className="text-brand underline-offset-2 hover:underline" href={mailto("Connecting our Razorpay account")}>{SALES_EMAIL}</a> and we&apos;ll help you set it up.
        </p>
      </section>
    </FigurePanel>
  );
}
