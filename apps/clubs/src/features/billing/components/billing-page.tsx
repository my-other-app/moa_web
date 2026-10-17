"use client";

import * as React from "react";
import { CheckIcon, CreditCardIcon, Loader2Icon, MailIcon, SparklesIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import { CardLabel, EmptyState, FigurePanel, Notice, ProgressBar, Segmented, Skeleton, StatusBadge, cn, type NoticeTone } from "@moa/ui";

import { useAccess } from "@/features/access";
import { useMyClub } from "@/features/club";

import { useEntitlements, usePlans, useRefreshBilling, useStartSubscription, useSubscription, startErrorMessage } from "../queries";
import { checkoutKey, openSubscriptionCheckout } from "../razorpay";
import {
  FREE_PLAN,
  LIMIT_FIELDS,
  SALES_EMAIL,
  STATUS_LABEL,
  STATUS_TONE,
  awaitingCheckout,
  billedByRazorpay,
  formatPaise,
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
 * Moving to a paid plan starts a Razorpay subscription and opens Razorpay's
 * checkout for the club to authorise it. The plan changes when Razorpay's
 * webhook reaches the server, so after checkout the page polls for a while
 * rather than claiming a change it has not seen.
 */

/** How long the page keeps asking after a checkout: Razorpay's webhook usually lands well inside this. */
const WATCH_MS = 2 * 60_000;

type Outcome = { tone: NoticeTone; text: string; link?: { href: string; label: string } };

type Action =
  | { kind: "current" }
  | { kind: "finish" }
  | { kind: "start"; label: string }
  | { kind: "talk"; label: string; subject: string };

interface Ctx {
  sub: Subscription | null;
  currentKey: string;
  currentCycle: Cycle | null;
  currentMonthly: number;
  cycle: Cycle;
}

/** What a plan's card offers the owner. */
function actionFor(plan: CatalogPlan, ctx: Ctx): Action {
  const sameCycle = isFree(plan) || plan.contact_sales || ctx.currentCycle === null || ctx.currentCycle === ctx.cycle;
  const current = plan.key === ctx.currentKey && sameCycle;
  // A trial that looks unpaid may well be authorised (the server is not told until it ends), so only a paid plan reads as unfinished.
  if (current) return awaitingCheckout(ctx.sub) && ctx.sub?.status === "past_due" ? { kind: "finish" } : { kind: "current" };
  if (plan.contact_sales) return { kind: "talk", label: "Talk to us", subject: `${plan.name} plan for our club` };
  // The server has no way for a club to cancel or step down yet.
  if (isFree(plan)) return { kind: "talk", label: "Talk to us to downgrade", subject: "Moving our club to the Free plan" };
  // A second Razorpay subscription would not replace the first: both would bill.
  if (billedByRazorpay(ctx.sub)) return { kind: "talk", label: "Talk to us to switch", subject: `Switching our club to ${plan.name} (${ctx.cycle})` };
  if (plan.key === ctx.currentKey) return { kind: "start", label: `Switch to ${ctx.cycle}` };
  // The server starts every subscription to a plan with trial days on its trial.
  if (plan.trial_days > 0) return { kind: "start", label: `Start ${plan.trial_days}-day trial` };
  return { kind: "start", label: plan.price_monthly_paise > ctx.currentMonthly ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}` };
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
  const [cycleChoice, setCycleChoice] = React.useState<Cycle | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  React.useEffect(() => {
    if (watchRound === 0) return;
    const t = window.setTimeout(() => setWatchRound(0), WATCH_MS);
    return () => window.clearTimeout(t);
  }, [watchRound]);

  const sub = subQ.data ?? null;
  const ent = entQ.data;
  const catalog = plansQ.data;
  const live = sub && sub.status !== "cancelled" ? sub : null;
  const currentKey = live?.plan?.key ?? ent?.plan_key ?? FREE_PLAN;
  const currentCycle = live && live.plan && !isFree(live.plan) ? live.cycle : null;
  // Until the club subscribes, the plan it picked at sign-up is the one offered first.
  const requested = !live && club?.requested_plan && club.requested_plan !== currentKey ? club.requested_plan : null;
  const requestedCycle = requested ? (club?.requested_cycle ?? null) : null;
  const cycle: Cycle = cycleChoice ?? currentCycle ?? requestedCycle ?? "monthly";
  const currentPlan = catalog?.plans.find((p) => p.key === currentKey);
  const ctx: Ctx = { sub, currentKey, currentCycle, currentMonthly: currentPlan?.price_monthly_paise ?? live?.plan?.price_monthly_paise ?? 0, cycle };

  const authorise = async (subscriptionId: string, description: string, fromServer?: { key?: string | null; checkoutUrl?: string | null }) => {
    const key = checkoutKey(fromServer?.key);
    const result = key
      ? await openSubscriptionCheckout({ key, subscriptionId, description, email: club?.contact_email, phone: club?.contact_phone })
      : ({ kind: "unavailable" } as const);
    if (result.kind === "authorised") {
      setOutcome({ tone: "admit", text: "Done. Razorpay is confirming it now, and this page updates on its own once it has — usually within a minute." });
      setWatchRound((r) => r + 1);
    } else if (result.kind === "dismissed") {
      setOutcome({ tone: "caution", text: "Checkout was closed before it finished, so nothing was charged. You can finish it from here any time." });
    } else if (fromServer?.checkoutUrl) {
      // No key in this build, or the script was blocked: Razorpay's own page does the same job.
      setOutcome({ tone: "accent", text: "Finish in Razorpay's checkout. This page updates once Razorpay confirms.", link: { href: fromServer.checkoutUrl, label: "Open checkout" } });
      setWatchRound((r) => r + 1);
    } else {
      setOutcome({ tone: "refuse", text: `Checkout could not open here. Use the link Razorpay emailed to ${club?.contact_email ?? "the club"}, or write to us.` });
    }
    void refresh();
  };

  const choose = async (plan: CatalogPlan) => {
    setOutcome(null);
    setBusy(plan.key);
    try {
      const started = await start.mutateAsync({ plan, cycle });
      void refresh();
      await authorise(started.razorpay_subscription_id, `${plan.name} · ${cycle}`, { key: started.key, checkoutUrl: started.checkout_url });
    } catch (error) {
      setOutcome({ tone: "refuse", text: startErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!sub?.razorpay_subscription_id) return;
    setOutcome(null);
    setBusy(currentKey);
    try {
      await authorise(sub.razorpay_subscription_id, `${sub.plan?.name ?? "Plan"} · ${sub.cycle}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Plan &amp; billing</h2>
          <p className="text-ink-2 mt-1 text-[13px]">Your plan, what it allows, and how much of it you use</p>
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

      {subQ.isError || entQ.isError ? (
        <EmptyState tone="muted" title="Could not load your plan" description="Try reloading the page." />
      ) : !ent || subQ.isPending ? (
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[220px] rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
          <CurrentPlan sub={live ?? sub} ent={ent} plan={currentPlan} canManage={canManage} busy={busy === currentKey} onFinish={finish} />
          <Usage ent={ent} />
        </div>
      )}

      <section aria-labelledby="plans-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            <h3 id="plans-title" className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">
              Plans
            </h3>
            <p className="text-ink-3 mt-0.5 text-[12.5px]">Paid plans renew on their own each cycle.</p>
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
                busy={busy === plan.key}
                disabled={busy !== null}
                onStart={() => choose(plan)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── The plan the club is on ─────────────────────────────────────────────

function CurrentPlan({ sub, ent, plan, canManage, busy, onFinish }: { sub: Subscription | null; ent: Entitlements; plan?: CatalogPlan; canManage: boolean; busy: boolean; onFinish: () => void }) {
  const name = sub?.plan?.name ?? ent.plan_name ?? plan?.name ?? "Free";
  const paid = sub?.plan ? priceFor(sub.plan, sub.cycle) : 0;
  const pending = awaitingCheckout(sub);
  // Razorpay says nothing to the server when a trial is authorised, only when it is first charged.
  const trialPending = pending && sub?.status === "trial";
  const end = sub?.current_period_end ? formatDate(sub.current_period_end) : null;

  let when: string | null = null;
  if (sub?.status === "trial") when = end ? `Trial ends ${end}` : sub.plan?.trial_days ? `${sub.plan.trial_days}-day trial; billing starts when it ends` : "On trial";
  else if (sub?.status === "active") when = end ? `Renews ${end}` : "Active";
  else if (sub?.status === "past_due") when = end ? `Payment due since ${end}` : "Waiting for the first payment";
  else if (sub?.status === "cancelled") when = end ? `Ended ${end}` : "Ended";

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Current plan">
      <CardLabel right={sub ? <StatusBadge label={STATUS_LABEL[sub.status]} tone={STATUS_TONE[sub.status]} /> : <StatusBadge label="No subscription" />}>
        Current plan
      </CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
          <CreditCardIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-ink text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">{sub?.status === "cancelled" ? "Free" : name}</div>
          <div className="text-ink-3 mt-0.5 text-[12.5px]">
            {sub && sub.status !== "cancelled" && paid > 0 ? `${formatPaise(paid)} billed ${sub.cycle}` : "Nothing to pay"}
          </div>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 text-[12.5px]">
        <div>
          <dt className="eyebrow">Billing</dt>
          <dd className="text-ink m-0 mt-1">{sub && sub.status !== "cancelled" && paid > 0 ? (sub.cycle === "yearly" ? "Yearly" : "Monthly") : "—"}</dd>
        </div>
        <div>
          <dt className="eyebrow">{sub?.status === "cancelled" ? "Ended" : "Renewal"}</dt>
          <dd className="text-ink m-0 mt-1">{when ?? "—"}</dd>
        </div>
      </dl>
      {sub?.status === "cancelled" ? <p className="text-ink-3 m-0 text-[12.5px]">{sub.plan?.name ?? "The paid plan"} has ended, so the club is back on Free.</p> : null}
      {sub?.status === "past_due" && !pending ? (
        <Notice tone="caution" tag="Payment">
          The last charge did not go through{sub.last_failure_reason ? ` (${sub.last_failure_reason})` : ""}. Razorpay tries again on its own; your plan stays on meanwhile.
        </Notice>
      ) : null}
      {pending ? (
        <Notice
          tone="caution"
          tag="Checkout"
          action={
            canManage ? (
              <button type="button" className={cn("btn btn-sm", trialPending ? "btn-secondary" : "btn-primary")} onClick={onFinish} disabled={busy}>
                {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null} {trialPending ? "Open checkout" : "Finish checkout"}
              </button>
            ) : null
          }
        >
          {trialPending
            ? `If you haven't authorised ${sub?.plan?.name ?? "this plan"} in Razorpay yet, do it before the trial ends: billing starts then.`
            : `${sub?.plan?.name ?? "This plan"} is waiting for you to authorise it in Razorpay.`}
        </Notice>
      ) : null}
      {!ent.configured ? <Notice tone="accent">Plans are not switched on yet, so nothing is capped for now.</Notice> : null}
    </FigurePanel>
  );
}

// ─── Usage against the limits ────────────────────────────────────────────

function Usage({ ent }: { ent: Entitlements }) {
  const rows = LIMIT_FIELDS.filter((f) => f.key in ent.limits);
  return (
    <FigurePanel className="flex flex-col gap-1 p-4" role="region" aria-label="Usage">
      <CardLabel right={ent.usage ? null : <span className="text-ink-3 text-[11px]">What your plan allows</span>}>Usage</CardLabel>
      {rows.length === 0 ? <p className="text-ink-3 m-0 mt-2 text-[12.5px]">Nothing is capped on this plan.</p> : null}
      <ul className="m-0 mt-1 flex list-none flex-col p-0">
        {rows.map((f) => {
          const cap = ent.limits[f.key] ?? null;
          const used = ent.usage?.[f.key] ?? null;
          const full = cap !== null && used !== null && used >= cap;
          const near = cap !== null && used !== null && used >= cap * 0.8;
          return (
            <li key={f.key} className="border-line-soft flex flex-col gap-1.5 border-b py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink font-medium">{f.label}</span>
                <span className={cn("shrink-0 tabular-nums", full ? "text-refuse font-medium" : "text-ink-2")}>
                  {cap === null
                    ? used !== null
                      ? `${used.toLocaleString("en-IN")} · Unlimited`
                      : "Unlimited"
                    : cap === 0
                      ? "Not included"
                      : used !== null
                        ? `${used.toLocaleString("en-IN")} of ${cap.toLocaleString("en-IN")}`
                        : limitText(cap, f.key === "storage_gb" ? "GB" : undefined)}
                </span>
              </div>
              {cap !== null && cap > 0 && used !== null ? (
                <ProgressBar value={Math.min(used, cap)} max={cap} tone={full ? "refuse" : near ? "caution" : "accent"} height={6} label={`${f.label}: ${used} of ${cap} ${f.unit}`} />
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
}: {
  plan: CatalogPlan;
  cycle: Cycle;
  action: Action;
  canManage: boolean;
  requested: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const id = React.useId();
  const price = priceLine(plan, cycle);
  const included = plan.features.filter((f) => f.included);
  const current = action.kind === "current" || action.kind === "finish";

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
          {requested ? <StatusBadge label="Picked at sign-up" tone="info" /> : null}
          {plan.featured && !current && !requested ? (
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
        {plan.trial_days > 0 && !plan.contact_sales ? <p className="text-brand m-0 mt-1 text-[12px] font-medium">{plan.trial_days}-day free trial</p> : null}
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
        <PlanAction action={action} plan={plan} canManage={canManage} busy={busy} disabled={disabled} onStart={onStart} />
      </div>
    </article>
  );
}

function PlanAction({ action, plan, canManage, busy, disabled, onStart }: { action: Action; plan: CatalogPlan; canManage: boolean; busy: boolean; disabled: boolean; onStart: () => void }) {
  if (action.kind === "current") return <p className="text-ink-3 m-0 text-[12.5px]">You&apos;re on this plan.</p>;
  if (action.kind === "finish") return <p className="text-ink-3 m-0 text-[12.5px]">Checkout not finished yet — see Current plan.</p>;
  if (!canManage) return null;
  if (action.kind === "talk") {
    return (
      <a className="btn btn-secondary w-full" href={mailto(action.subject)}>
        <MailIcon className="size-4" /> {action.label}
      </a>
    );
  }
  return (
    <button type="button" className={cn("btn w-full", plan.featured ? "btn-primary" : "btn-secondary")} onClick={onStart} disabled={disabled} aria-label={`${action.label} — ${plan.name}`}>
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : null} {action.label}
    </button>
  );
}
