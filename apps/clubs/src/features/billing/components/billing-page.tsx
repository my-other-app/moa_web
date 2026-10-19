"use client";

import * as React from "react";
import { CheckIcon, CreditCardIcon, GiftIcon, Loader2Icon, MailIcon, SparklesIcon } from "lucide-react";
import { formatDate, formatDateTime } from "@moa/app-kit";
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
  ProgressBar,
  Segmented,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  type NoticeTone,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { AiUsagePanel } from "@/features/ai";
import { useMyClub } from "@/features/club";

import { billingErrorMessage, isComplimentaryRefusal, useCancelSubscription, useEntitlements, usePlans, useRefreshBilling, useStartSubscription, useSubscription } from "../queries";
import { checkoutKey, openSubscriptionCheckout } from "../razorpay";
import {
  FREE_PLAN,
  LIMIT_FIELDS,
  SALES_EMAIL,
  STATUS_LABEL,
  STATUS_TONE,
  blocksCheckout,
  cancellable,
  complimentaryPlan,
  formatPaise,
  inGrace,
  isFree,
  limitText,
  mailto,
  priceFor,
  priceLine,
  type CatalogPlan,
  type Cycle,
  type Entitlements,
  type Subscription,
} from "../schemas";

/**
 * Plan & billing: the plan the club is on, how much of it is used, and the
 * plans it can move to.
 *
 * Only the club's own account (the owner) can change the plan: the server
 * refuses every write under /clubs/subscription from a team member, admins
 * included (club_access.policy `_OWNER_WRITES`). Everyone else sees the
 * same page without its buttons.
 *
 * Choosing a paid plan opens a checkout the server records as `pending`,
 * which grants nothing: the club keeps what it had until Razorpay confirms.
 * So the plan shown as current is the one that grants (GET
 * /clubs/entitlements), and a checkout waiting for payment is shown beside
 * it, with a way to finish it or call it off. After checkout the page polls
 * for a while rather than claiming a change it has not seen.
 */

/** How long the page keeps asking after a checkout: Razorpay's webhook usually lands well inside this. */
const WATCH_MS = 2 * 60_000;

type Outcome = { tone: NoticeTone; text: string; link?: { href: string; label: string } };

type Action =
  | { kind: "current" }
  | { kind: "pending" }
  | { kind: "start"; label: string }
  | { kind: "free" }
  | { kind: "note"; text: string }
  | { kind: "talk"; label: string; subject: string };

interface Ctx {
  sub: Subscription | null;
  currentKey: string;
  currentCycle: Cycle | null;
  currentMonthly: number;
  cycle: Cycle;
  /** MyOtherApp gave the club its plan free: nothing on sale here applies. */
  complimentary?: boolean;
}

/** What every other plan's card says to a club on a plan given free. */
export const COMP_CHANGE = "Talk to us to change your plan.";

/** What a plan's card offers the owner. */
function actionFor(plan: CatalogPlan, ctx: Ctx): Action {
  if (ctx.complimentary) {
    // No checkout and no cancel: the server refuses both (409 COMPLIMENTARY_PLAN).
    return plan.key === ctx.currentKey ? { kind: "current" } : { kind: "note", text: COMP_CHANGE };
  }
  const pending = ctx.sub?.status === "pending" ? ctx.sub : null;
  if (pending && pending.plan?.key === plan.key && pending.cycle === ctx.cycle) return { kind: "pending" };
  const sameCycle = isFree(plan) || plan.contact_sales || ctx.currentCycle === null || ctx.currentCycle === ctx.cycle;
  if (plan.key === ctx.currentKey && sameCycle) return { kind: "current" };
  if (plan.contact_sales) return { kind: "talk", label: "Talk to us", subject: `${plan.name} plan for our club` };
  if (isFree(plan)) {
    // Moving to Free is cancelling: the club falls to Free when the paid plan ends.
    if (cancellable(ctx.sub) && ctx.sub.status !== "pending") return { kind: "free" };
    // Already cancelled: the club lands here when what it paid for runs out.
    if (ctx.sub?.cancel_at_period_end && ctx.sub.status !== "pending") {
      const end = ctx.sub.status === "trial" ? (ctx.sub.trial_ends_at ?? ctx.sub.current_period_end) : ctx.sub.current_period_end;
      return { kind: "note", text: end ? `The club moves here after ${formatDate(end)}.` : "The club moves here when the plan ends." };
    }
    return { kind: "talk", label: "Talk to us to downgrade", subject: "Moving our club to the Free plan" };
  }
  // The server refuses a second Razorpay subscription while one is running (409 SUBSCRIPTION_EXISTS).
  if (blocksCheckout(ctx.sub)) return { kind: "talk", label: "Talk to us to switch", subject: `Switching our club to ${plan.name} (${ctx.cycle})` };
  if (plan.key === ctx.currentKey) return { kind: "start", label: `Switch to ${ctx.cycle}` };
  return { kind: "start", label: plan.price_monthly_paise > ctx.currentMonthly ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}` };
}

/** What cancelling does, in the words the confirm dialog uses, by the subscription's state. */
export function cancelConsequence(sub: Subscription, onNow: string | null | undefined): string {
  const plan = sub.plan?.name ?? "The plan";
  const end = sub.status === "trial" ? (sub.trial_ends_at ?? sub.current_period_end) : sub.current_period_end;
  const until = end ? formatDate(end) : null;
  switch (sub.status) {
    case "pending":
      return `The checkout for ${plan} is closed and nothing is charged. The club stays on ${onNow ?? "Free"}.`;
    case "active":
      return until
        ? `${plan} stays on until ${until}, the end of what you've paid for. Razorpay won't charge you again, and then the club moves to Free.`
        : `Razorpay won't charge you again. ${plan} stays on until the end of what you've paid for, then the club moves to Free.`;
    case "trial":
      return until
        ? `Razorpay stops the subscription now, so you won't be charged. You keep ${plan} until the trial ends on ${until}, then the club moves to Free.`
        : "Razorpay stops the subscription now, so you won't be charged. The club moves to Free when the trial ends.";
    case "past_due":
      return until
        ? `Razorpay stops trying to charge you now. You keep ${plan} until ${until}, then the club moves to Free.`
        : "Razorpay stops trying to charge you now, and the club moves to Free.";
    case "paused":
      return until
        ? `The paused subscription is cancelled now and won't be charged again. You keep ${plan} until ${until}, then the club moves to Free.`
        : "The paused subscription is cancelled now and won't be charged again. The club stays on Free.";
    default:
      return "There is nothing left to cancel.";
  }
}

export function BillingPage() {
  const access = useAccess();
  // Mirrors the server: only the club's own account may change the plan.
  const canManage = access.role === "owner";
  // Each checkout starts a new round of polling; 0 is not polling.
  const [watchRound, setWatchRound] = React.useState(0);
  const watching = watchRound > 0;
  const subQ = useSubscription(watching);
  const entQ = useEntitlements(watching);
  const plansQ = usePlans();
  const club = useMyClub().data;
  const refresh = useRefreshBilling();
  const start = useStartSubscription();
  const cancel = useCancelSubscription();
  const [cycleChoice, setCycleChoice] = React.useState<Cycle | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  // Razorpay's hosted link for each checkout opened here; the server does not keep it.
  const [links, setLinks] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (watchRound === 0) return;
    const t = window.setTimeout(() => setWatchRound(0), WATCH_MS);
    return () => window.clearTimeout(t);
  }, [watchRound]);

  const sub = subQ.data ?? null;
  const ent = entQ.data;
  const catalog = plansQ.data;
  // The plan that grants right now: mid-checkout, still the one the club had.
  const currentKey = ent?.plan_key ?? FREE_PLAN;
  const currentPlan = catalog?.plans.find((p) => p.key === currentKey);
  const currentCycle = ent?.status && ent.cycle && !(currentPlan && isFree(currentPlan)) ? ent.cycle : null;
  // Until the club subscribes, the plan it picked at sign-up is the one offered first.
  const unsubscribed = !sub || (!sub.entitled && sub.status !== "pending");
  const comp = complimentaryPlan(ent, sub);
  const requested = !comp && unsubscribed && ent?.requested_plan && ent.requested_plan !== currentKey ? ent.requested_plan : null;
  const requestedCycle = requested ? (ent?.requested_cycle ?? null) : null;
  const cycle: Cycle = cycleChoice ?? currentCycle ?? requestedCycle ?? "monthly";
  const ctx: Ctx = { sub, currentKey, currentCycle, currentMonthly: currentPlan?.price_monthly_paise ?? 0, cycle, complimentary: comp !== null };

  const authorise = async (subscriptionId: string, description: string, link: string | null | undefined, expires: string | null | undefined) => {
    const key = checkoutKey();
    const result = key
      ? await openSubscriptionCheckout({ key, subscriptionId, description, email: club?.contact_email, phone: club?.contact_phone })
      : ({ kind: "unavailable" } as const);
    if (result.kind === "authorised") {
      setOutcome({ tone: "admit", text: "Payment authorised. Razorpay is confirming it, and your plan changes when it has — usually within a minute." });
      setWatchRound((r) => r + 1);
    } else if (result.kind === "dismissed") {
      setOutcome({
        tone: "caution",
        text: `Checkout was closed before it finished, so nothing was charged and your plan hasn't changed. You can finish or cancel it from Current plan${expires ? ` until ${formatDateTime(expires)}` : ""}.`,
      });
    } else if (link) {
      // No key in this build, or the script was blocked: Razorpay's own page does the same job.
      setOutcome({ tone: "accent", text: "Finish in Razorpay's checkout. This page updates once Razorpay confirms.", link: { href: link, label: "Open checkout" } });
      setWatchRound((r) => r + 1);
    } else {
      setOutcome({ tone: "caution", text: `Checkout can't open here. Use the payment link Razorpay emailed to ${club?.contact_email ?? "the club"}, or cancel this checkout and start again.` });
    }
    void refresh();
  };

  const choose = async (plan: CatalogPlan) => {
    setOutcome(null);
    setBusy(`start:${plan.key}`);
    try {
      const started = await start.mutateAsync({ plan, cycle });
      const link = started.checkout_url;
      if (link) setLinks((l) => ({ ...l, [started.razorpay_subscription_id]: link }));
      void refresh();
      await authorise(started.razorpay_subscription_id, `${plan.name} · ${started.cycle}`, link, started.expires_at);
    } catch (error) {
      setOutcome({ tone: "refuse", text: billingErrorMessage(error) });
      // The plan was given free since this page loaded: read it again so the page says so.
      if (isComplimentaryRefusal(error)) void refresh();
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!sub?.razorpay_subscription_id) return;
    setOutcome(null);
    setBusy("finish");
    try {
      await authorise(sub.razorpay_subscription_id, `${sub.plan?.name ?? "Plan"} · ${sub.cycle}`, links[sub.razorpay_subscription_id], sub.checkout_expires_at);
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = async () => {
    if (!sub) return;
    const was = sub;
    setConfirming(false);
    setOutcome(null);
    setBusy("cancel");
    try {
      const after = await cancel.mutateAsync();
      const until = after.current_period_end ? formatDate(after.current_period_end) : null;
      setOutcome(
        was.status === "pending"
          ? { tone: "admit", text: "Checkout cancelled. Nothing was charged, and your plan is as it was." }
          : { tone: "admit", text: `Cancelled. ${until && after.entitled ? `${was.plan?.name ?? "Your plan"} stays on until ${until}, then the club moves to Free.` : "The club is on Free now."}` },
      );
    } catch (error) {
      setOutcome({ tone: "refuse", text: billingErrorMessage(error) });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Plan &amp; billing</h2>
          <p className="text-ink-2 mt-1 text-[13px]">Your plan, what it includes, and how much of it you use</p>
        </div>
        {watching ? (
          <span className="text-ink-3 flex items-center gap-1.5 text-[12.5px]" role="status">
            <Loader2Icon className="size-3.5 animate-spin" /> Waiting for Razorpay to confirm…
          </span>
        ) : null}
      </header>

      {!canManage && access.known ? (
        <Notice tone="neutral" tag="Read only">
          Only the club&apos;s own account can change the plan. You&apos;re signed in as {access.roleLabel.toLowerCase()}.
        </Notice>
      ) : null}

      {outcome ? (
        <Notice
          tone={outcome.tone}
          action={
            outcome.link ? (
              <a className="btn btn-secondary btn-sm" href={outcome.link.href} target="_blank" rel="noopener noreferrer">
                {outcome.link.label}
              </a>
            ) : null
          }
        >
          {outcome.text}
        </Notice>
      ) : null}

      {sub && inGrace(sub) ? <GraceBanner sub={sub} email={club?.contact_email} canManage={canManage} /> : null}

      {subQ.isError || entQ.isError ? (
        <EmptyState tone="muted" title="Could not load your plan" description="Try reloading the page." />
      ) : !ent || subQ.isPending ? (
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[220px] rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
          {comp ? (
            <ComplimentaryPlan name={ent.plan_name ?? currentPlan?.name ?? "Your plan"} endsAt={comp.endsAt} canManage={canManage} />
          ) : (
            <CurrentPlan
              sub={sub}
              ent={ent}
              plan={currentPlan}
              canManage={canManage}
              busy={busy}
              canOpenCheckout={Boolean(checkoutKey() || (sub?.razorpay_subscription_id && links[sub.razorpay_subscription_id]))}
              onFinish={finish}
              onCancel={() => setConfirming(true)}
            />
          )}
          <Usage ent={ent} />
        </div>
      )}

      {/* AI assist: the month's actions, or the club's own key. Nothing while AI is off. */}
      <AiUsagePanel />

      <section aria-labelledby="plans-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            <h3 id="plans-title" className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">
              Plans
            </h3>
            <p className="text-ink-3 mt-0.5 text-[12.5px]">Paid plans renew on their own each cycle until you cancel.</p>
          </div>
          <Segmented
            label="Billing cycle"
            value={cycle}
            onChange={setCycleChoice}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: catalog?.yearly_months_free ? `Yearly · ${catalog.yearly_months_free} months free` : "Yearly" },
            ]}
            className="min-w-[240px]"
          />
        </div>

        {plansQ.isError ? (
          <EmptyState tone="muted" title="Plans are not available right now" description={`Try again in a little while, or write to ${SALES_EMAIL} to change your plan.`} />
        ) : subQ.isError || entQ.isError ? null : !catalog || !ent || !subQ.isSuccess ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[340px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                cycle={cycle}
                action={actionFor(plan, ctx)}
                canManage={canManage}
                requested={plan.key === requested}
                busy={busy === `start:${plan.key}`}
                disabled={busy !== null}
                onStart={() => choose(plan)}
                onFree={() => setConfirming(true)}
              />
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{sub?.status === "pending" ? "Cancel this checkout?" : `Cancel ${sub?.plan?.name ?? "your plan"}?`}</AlertDialogTitle>
            <AlertDialogDescription>{sub ? cancelConsequence(sub, ent?.plan_name) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{sub?.status === "pending" ? "Keep checkout" : "Keep plan"}</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={() => void confirmCancel()}>
              {sub?.status === "pending" ? "Cancel checkout" : "Cancel plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── A failed charge, and the time left to fix it ───────────────────────

/**
 * After a charge fails the club keeps its plan for a grace period; when it
 * ends with nothing paid, the club moves to Free. Said at the top of the
 * page, with what the club can do: Razorpay retries on its own, and the
 * card or UPI it charges is changed through the link in Razorpay's email.
 */
export function GraceBanner({ sub, email, canManage }: { sub: Subscription; email?: string | null; canManage: boolean }) {
  const by = sub.grace_ends_at ? formatDate(sub.grace_ends_at) : "the end of your grace period";
  const plan = sub.plan?.name ?? "your plan";
  return (
    <Notice
      tone="refuse"
      tag="Payment"
      action={
        canManage ? (
          <a className="btn btn-secondary btn-sm" href={mailto(`Payment for ${plan}`, "Our last payment failed and we'd like to fix it.")}>
            <MailIcon className="size-3.5" /> Talk to us
          </a>
        ) : null
      }
    >
      <strong className="font-semibold">Payment failed — update by {by} or your club moves to Free.</strong>{" "}
      {sub.last_failure_reason ? `Razorpay said: ${sub.last_failure_reason.replace(/\.$/, "")}. ` : ""}
      {sub.halted_at
        ? `Razorpay has stopped retrying the charge, so ${plan} ends on ${by} unless a payment goes through. `
        : `Razorpay retries the charge on its own until then, and ${plan} stays on meanwhile. `}
      To pay with another card or UPI, open the link in Razorpay&apos;s email{email ? ` to ${email}` : ""} and update the payment method; the retry uses it. If the email is gone, write to {SALES_EMAIL}.
    </Notice>
  );
}

// ─── A plan given free ───────────────────────────────────────────────────

/**
 * "Growth — provided free by MyOtherApp until 31 Mar 2027": a sponsored or
 * privileged club. Nothing to pay, so no checkout and nothing to cancel; a
 * change of plan goes through us.
 */
export function ComplimentaryPlan({ name, endsAt, canManage }: { name: string; endsAt: string | null; canManage: boolean }) {
  const until = endsAt ? `until ${formatDate(endsAt)}` : "with no end date";
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Current plan">
      <CardLabel right={<StatusBadge label="Free from MyOtherApp" tone="success" />}>Current plan</CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
          <GiftIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-ink text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
            {name} — provided free by MyOtherApp {until}
          </div>
          <div className="text-ink-3 mt-0.5 text-[12.5px]">
            Nothing to pay{endsAt ? `. After ${formatDate(endsAt)} the club moves to Free unless we extend it.` : "."}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <a className="btn btn-secondary btn-sm" href={mailto(`Our ${name} plan`, "We'd like to change our club's plan.")}>
            <MailIcon className="size-3.5" /> Talk to us to change your plan
          </a>
        ) : (
          <span className="text-ink-3 text-[12.5px]">{COMP_CHANGE}</span>
        )}
      </div>
    </FigurePanel>
  );
}

// ─── The plan the club is on ─────────────────────────────────────────────

function CurrentPlan({
  sub,
  ent,
  plan,
  canManage,
  busy,
  canOpenCheckout,
  onFinish,
  onCancel,
}: {
  sub: Subscription | null;
  ent: Entitlements;
  plan?: CatalogPlan;
  canManage: boolean;
  busy: string | null;
  canOpenCheckout: boolean;
  onFinish: () => void;
  onCancel: () => void;
}) {
  // The row is what grants only when the server says so; mid-checkout the grant is the plan the club had.
  const granting = sub?.entitled ? sub : null;
  const status = ent.status ?? null;
  const name = ent.plan_name ?? plan?.name ?? "Free";
  const paid = granting?.plan ? priceFor(granting.plan, granting.cycle) : plan && ent.cycle ? priceFor(plan, ent.cycle) : 0;
  const end = ent.current_period_end ? formatDate(ent.current_period_end) : null;
  const pending = sub?.status === "pending" ? sub : null;

  let when: string | null = null;
  if (status === "active") when = granting?.cancel_at_period_end ? (end ? `Cancels on ${end}` : "Cancels at the end of the period") : end ? `Renews ${end}` : "Active";
  else if (status === "trial") when = end ? `Trial ends ${end}` : "On trial";
  else if (status === "past_due") when = "Payment failed; Razorpay is retrying";
  else if (status === "cancelled") when = end ? `Ends ${end}` : "Ending";

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Current plan">
      <CardLabel right={status ? <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} /> : <StatusBadge label="No subscription" />}>Current plan</CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
          <CreditCardIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-ink text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">{name}</div>
          <div className="text-ink-3 mt-0.5 text-[12.5px]">{status && paid > 0 && ent.cycle ? `${formatPaise(paid)} billed ${ent.cycle}` : "Nothing to pay"}</div>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 text-[12.5px]">
        <div>
          <dt className="eyebrow">Billing</dt>
          <dd className="text-ink m-0 mt-1">{status && paid > 0 && ent.cycle ? (ent.cycle === "yearly" ? "Yearly" : "Monthly") : "—"}</dd>
        </div>
        <div>
          <dt className="eyebrow">{status === "cancelled" ? "Ends" : "Renewal"}</dt>
          <dd className="text-ink m-0 mt-1">{when ?? "—"}</dd>
        </div>
      </dl>

      {granting?.cancel_at_period_end && status !== "cancelled" ? (
        <p className="text-ink-3 m-0 text-[12.5px]">
          You cancelled{granting.cancel_requested_at ? ` on ${formatDate(granting.cancel_requested_at)}` : ""}. The club moves to Free{end ? ` after ${end}` : " when this period ends"}.
        </p>
      ) : null}
      {status === "cancelled" ? <p className="text-ink-3 m-0 text-[12.5px]">This plan has been cancelled. The club moves to Free{end ? ` after ${end}` : ""}.</p> : null}

      {pending ? (
        <Notice
          tone="caution"
          tag="Checkout"
          action={
            canManage ? (
              <span className="flex flex-wrap gap-1.5">
                {canOpenCheckout ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={onFinish} disabled={busy !== null}>
                    {busy === "finish" ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Finish checkout
                  </button>
                ) : null}
                <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy !== null}>
                  {busy === "cancel" ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Cancel
                </button>
              </span>
            ) : null
          }
        >
          <strong>Waiting for payment — finish checkout</strong> for {pending.plan?.name ?? "the new plan"} ({pending.cycle}). Nothing is charged or changed until you do.
          {pending.checkout_expires_at ? ` The link expires ${formatDateTime(pending.checkout_expires_at)}.` : ""}
          {!canOpenCheckout ? " Use the payment link Razorpay emailed to the club." : ""}
        </Notice>
      ) : null}

      {sub?.status === "past_due" && !inGrace(sub) ? (
        <Notice tone="caution" tag="Payment">
          The last charge did not go through{sub.last_failure_reason ? ` (${sub.last_failure_reason})` : ""}. Razorpay tries again on its own{sub.entitled ? "; your plan stays on meanwhile" : ""}.
        </Notice>
      ) : null}

      {sub?.status === "paused" ? (
        <Notice tone="neutral" tag="Paused">
          Razorpay has paused this subscription, so it isn&apos;t charged and {sub.plan?.name ?? "the plan"} isn&apos;t on. Write to {SALES_EMAIL} to resume it, or cancel it.
        </Notice>
      ) : null}

      {!ent.configured ? <Notice tone="accent">Plans are not switched on yet, so everything is included for now.</Notice> : null}

      {canManage && cancellable(sub) && sub.status !== "pending" ? (
        <div>
          <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={onCancel} disabled={busy !== null}>
            {busy === "cancel" ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Cancel plan
          </button>
        </div>
      ) : null}
    </FigurePanel>
  );
}

// ─── Usage against what the plan includes ────────────────────────────────

function Usage({ ent }: { ent: Entitlements }) {
  const rows = LIMIT_FIELDS.filter((f) => f.key in ent.limits);
  return (
    <FigurePanel className="flex flex-col gap-1 p-4" role="region" aria-label="Usage">
      <CardLabel right={<span className="text-ink-3 text-[11px]">Included in your plan</span>}>Usage</CardLabel>
      {rows.length === 0 ? <p className="text-ink-3 m-0 mt-2 text-[12.5px]">Everything is included on this plan.</p> : null}
      <ul className="m-0 mt-1 flex list-none flex-col p-0">
        {rows.map((f) => {
          const cap = ent.limits[f.key] ?? null;
          // Only the four limits counted per club have a number; the rest are shown as what the plan includes.
          const used = f.key in ent.usage ? (ent.usage[f.key] ?? 0) : null;
          const reached = cap !== null && used !== null && used >= cap;
          let text: string;
          if (cap === 0) text = "Not included";
          else if (cap === null) text = used !== null ? `${used.toLocaleString("en-IN")} used · Unlimited` : "Unlimited";
          else if (used !== null) text = `${used.toLocaleString("en-IN")} of ${cap.toLocaleString("en-IN")} included`;
          else text = limitText(cap, f.key === "storage_gb" ? "GB" : undefined);
          return (
            <li key={f.key} className="border-line-soft flex flex-col gap-1.5 border-b py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink font-medium">{f.label}</span>
                <span className="text-ink-2 shrink-0 tabular-nums">{text}</span>
              </div>
              {cap !== null && cap > 0 && used !== null ? (
                <ProgressBar value={Math.min(used, cap)} max={cap} tone={reached ? "caution" : "accent"} height={6} label={`${f.label}: ${used} of ${cap} included`} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}

// ─── A plan on sale ──────────────────────────────────────────────────────

const LIMIT_PREVIEW = ["events_per_month", "registrations_per_month", "committee_seats"] as const;
const FEATURE_PREVIEW = 6;

function PlanCard({
  plan,
  cycle,
  action,
  canManage,
  requested,
  busy,
  disabled,
  onStart,
  onFree,
}: {
  plan: CatalogPlan;
  cycle: Cycle;
  action: Action;
  canManage: boolean;
  requested: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  onFree: () => void;
}) {
  const id = React.useId();
  const price = priceLine(plan, cycle);
  const included = plan.features.filter((f) => f.included);
  const current = action.kind === "current";

  return (
    <article
      aria-labelledby={`${id}-name`}
      className={cn(
        "bg-card ring-border/70 flex min-w-0 flex-col gap-3 rounded-2xl p-4 shadow-sm ring-1",
        plan.featured && "ring-brand-line",
        requested && "ring-brand ring-2",
        current && "ring-admit-line ring-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id={`${id}-name`} className="text-ink m-0 text-[16px] font-semibold tracking-[-0.01em]">
            {plan.name}
          </h4>
          {plan.tagline ? <p className="text-ink-3 m-0 mt-0.5 text-[12.5px] leading-[1.45]">{plan.tagline}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {current ? <StatusBadge label="Current plan" tone="success" /> : null}
          {action.kind === "pending" ? <StatusBadge label="Waiting for payment" tone="warning" /> : null}
          {requested ? <StatusBadge label="Picked at sign-up" tone="info" /> : null}
          {plan.featured && !current && !requested && action.kind !== "pending" ? (
            <span className="text-brand flex items-center gap-1 text-[11.5px] font-medium">
              <SparklesIcon className="size-3.5" /> Most popular
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-ink text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{price.amount}</span>
          {price.per ? <span className="text-ink-3 text-[12.5px]">{price.per}</span> : null}
        </div>
        {price.note ? <p className="text-ink-3 m-0 mt-1 text-[12px]">{price.note}</p> : null}
        {plan.trial_days > 0 && !plan.contact_sales ? <p className="text-brand m-0 mt-1 text-[12px] font-medium">{plan.trial_days}-day free trial on a first subscription</p> : null}
      </div>

      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
        {LIMIT_PREVIEW.map((key) => {
          const field = LIMIT_FIELDS.find((f) => f.key === key);
          if (!field || !(key in plan.limits)) return null;
          const cap = plan.limits[key] ?? null;
          return (
            <li key={key} className="flex justify-between gap-2">
              <span className="text-ink-2">{field.label}</span>
              <span className="text-ink tabular-nums">{cap === null ? "Unlimited" : cap === 0 ? "—" : cap.toLocaleString("en-IN")}</span>
            </li>
          );
        })}
      </ul>

      {included.length ? (
        <ul className="border-line-soft m-0 flex list-none flex-col gap-1 border-t p-0 pt-3 text-[12.5px]">
          {included.slice(0, FEATURE_PREVIEW).map((f) => (
            <li key={f.key} className="text-ink-2 flex items-center gap-1.5">
              <CheckIcon className="text-admit size-3.5 shrink-0" /> {f.label}
            </li>
          ))}
          {included.length > FEATURE_PREVIEW ? <li className="text-ink-3">and {included.length - FEATURE_PREVIEW} more</li> : null}
        </ul>
      ) : null}

      <div className="mt-auto pt-1">
        <PlanAction action={action} plan={plan} canManage={canManage} busy={busy} disabled={disabled} onStart={onStart} onFree={onFree} />
      </div>
    </article>
  );
}

function PlanAction({ action, plan, canManage, busy, disabled, onStart, onFree }: { action: Action; plan: CatalogPlan; canManage: boolean; busy: boolean; disabled: boolean; onStart: () => void; onFree: () => void }) {
  if (action.kind === "current") return <p className="text-ink-3 m-0 text-[12.5px]">You&apos;re on this plan.</p>;
  if (action.kind === "pending") return <p className="text-ink-3 m-0 text-[12.5px]">Waiting for payment — finish or cancel it under Current plan.</p>;
  if (action.kind === "note") return <p className="text-ink-3 m-0 text-[12.5px]">{action.text}</p>;
  if (!canManage) return null;
  if (action.kind === "talk") {
    return (
      <a className="btn btn-secondary w-full" href={mailto(action.subject)}>
        <MailIcon className="size-4" /> {action.label}
      </a>
    );
  }
  if (action.kind === "free") {
    return (
      <button type="button" className="btn btn-secondary w-full" onClick={onFree} disabled={disabled}>
        Move to Free
      </button>
    );
  }
  return (
    <button type="button" className={cn("btn w-full", plan.featured ? "btn-primary" : "btn-secondary")} onClick={onStart} disabled={disabled} aria-label={`${action.label} — ${plan.name}`}>
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : null} {action.label}
    </button>
  );
}
