"use client";

import * as React from "react";
import { GiftIcon, Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NativeSelect,
  Notice,
  Segmented,
  Switch,
} from "@moa/ui";

import { ClubPicker, type PickedClub } from "@/components/club-picker";
import { useCan } from "@/hooks/use-can";

import { LIVE_SUBSCRIPTION } from "../api";
import { useAssignPlan, usePlans } from "../queries";
import {
  REASON_MAX,
  givePlanProblems,
  givePlanSummary,
  localDay,
  type GivePlanInput,
  type Plan,
  type Subscription,
} from "../schemas";

/** The plans an admin may give: every one, hidden and legacy too, except those priced in a conversation. */
export function givablePlans(plans: Plan[]): Plan[] {
  return plans.filter((plan) => !plan.contact_sales);
}

function planOptionLabel(plan: Plan): string {
  return plan.visibility === "public" ? plan.name : `${plan.name} (${plan.visibility})`;
}

/** The date field's value for an ISO moment, in India (where the end of the day is set). */
function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function refusalText(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.fieldErrors) {
    const details = Object.entries(error.fieldErrors)
      .map(([field, messages]) => `${field.replace(/_/g, " ")}: ${Array.isArray(messages) ? messages.join(", ") : String(messages)}`)
      .join("; ");
    return details ? `${error.message.replace(/\.$/, "")} — ${details}` : error.message;
  }
  return error instanceof Error && error.message ? error.message : "That did not go through.";
}

/**
 * Give a club a plan, directly: the owner's lever for a sponsored or
 * privileged club.
 *
 * Free by default — ₹0, with a reason, until a day or for good, and never
 * counted as revenue. A club already paying through Razorpay is refused
 * (409 LIVE_SUBSCRIPTION) and the dialog asks whether to cancel that
 * subscription and go ahead, rather than leave the club charged for a plan it
 * was given.
 *
 * Money permission only; the callers do not offer it otherwise, and the
 * dialog renders nothing for a role without it.
 */
export function GivePlanDialog({
  club: fixedClub,
  current,
  onClose,
}: {
  /** The club, when the dialog was opened from it; null to pick one here. */
  club: PickedClub | null;
  /** The club's subscription row, to start from what it has. */
  current?: Subscription | null;
  onClose: () => void;
}) {
  const canMoney = useCan("manage_money");
  const plans = usePlans();
  const assign = useAssignPlan();
  const givable = givablePlans(plans.data ?? []);

  const [picked, setPicked] = React.useState<PickedClub | null>(null);
  const club = fixedClub ?? picked;
  const currentPlan = current?.plan && !current.plan.contact_sales ? current.plan.id : null;
  const [input, setInput] = React.useState<GivePlanInput>(() => ({
    planId: currentPlan,
    cycle: current?.cycle ?? "monthly",
    // Free unless the admin says otherwise: the reason this dialog exists.
    complimentary: true,
    reason: current?.comp_reason ?? "",
    endsOn: dayOf(current?.comp_ends_at),
  }));
  const [tried, setTried] = React.useState(false);
  // The server asked: this club pays through Razorpay; cancel that and go ahead?
  const [liveAsk, setLiveAsk] = React.useState(false);
  const [today] = React.useState(() => localDay(new Date()));

  const set = <K extends keyof GivePlanInput>(key: K, value: GivePlanInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    setLiveAsk(false);
    assign.reset();
  };

  const problems = givePlanProblems(input);
  const plan = givable.find((p) => p.id === input.planId) ?? null;
  const summary = givePlanSummary(input, plan);
  const ready = Boolean(club) && Object.keys(problems).length === 0;
  const refused = assign.error && !liveAsk ? refusalText(assign.error) : null;

  if (!canMoney) return null;

  const send = (cancelRazorpay: boolean) => {
    setTried(true);
    if (!club || !ready) return;
    assign.mutate(
      { clubId: club.id, plan: input, cancelRazorpay },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409 && error.errorCode === LIVE_SUBSCRIPTION) setLiveAsk(true);
        },
      }
    );
  };

  const show = (field: keyof typeof problems) => (tried ? problems[field] : undefined);
  const what = input.complimentary ? "the free plan" : "the plan";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(liveAsk);
          }}
        >
          <DialogHeader>
            <DialogTitle>{fixedClub ? `Give ${fixedClub.name} a plan` : "Give a club a plan"}</DialogTitle>
            <DialogDescription>
              The club gets the plan at once. Nothing is charged; a free plan is ₹0 and is not counted as revenue.
            </DialogDescription>
          </DialogHeader>

          {fixedClub ? null : (
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">Club</span>
              <ClubPicker value={picked} onChange={(c) => { setPicked(c); setLiveAsk(false); assign.reset(); }} verifiedOnly />
              {tried && !club ? <span className="text-refuse text-[12px]">Pick the club.</span> : null}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="eyebrow">Plan</span>
              <NativeSelect
                aria-label="Plan"
                value={input.planId ?? ""}
                onChange={(e) => set("planId", e.target.value ? Number(e.target.value) : null)}
                aria-invalid={show("plan") ? true : undefined}
                disabled={plans.isPending}
              >
                <option value="">{plans.isPending ? "Loading plans…" : "Pick a plan"}</option>
                {givable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {planOptionLabel(p)}
                  </option>
                ))}
              </NativeSelect>
              {show("plan") ? <span className="text-refuse text-[12px]">{show("plan")}</span> : null}
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">Cycle</span>
              <Segmented
                label="Cycle"
                value={input.cycle}
                onChange={(v) => set("cycle", v)}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
            </div>
          </div>

          <div className="border-line-soft flex items-start gap-3 rounded-[var(--radius-field)] border px-3 py-2.5">
            <Switch id="give-plan-free" checked={input.complimentary} onCheckedChange={(on) => set("complimentary", on)} className="mt-0.5" />
            <label htmlFor="give-plan-free" className="flex min-w-0 flex-col">
              <span className="text-ink text-[13px] font-medium">Free for this club (not counted as revenue)</span>
              <span className="text-ink-3 text-[11.5px]">For a sponsored or privileged club. Off: the club is moved to the plan at its price, still without charging it.</span>
            </label>
          </div>

          {input.complimentary ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="eyebrow">Reason</span>
                <textarea
                  className="input min-h-[64px]"
                  value={input.reason}
                  maxLength={REASON_MAX}
                  onChange={(e) => set("reason", e.target.value)}
                  placeholder="Sponsored by the college's tech fest, 2026–27"
                  aria-label="Reason"
                  aria-invalid={show("reason") ? true : undefined}
                  aria-describedby="give-plan-reason-help"
                />
                <span id="give-plan-reason-help" className={show("reason") ? "text-refuse text-[12px]" : "text-ink-3 text-[12px]"}>
                  {show("reason") ?? `Required. ${input.reason.trim().length}/${REASON_MAX}`}
                </span>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">Ends</span>
                <div role="radiogroup" aria-label="Ends" className="grid gap-2 sm:grid-cols-2">
                  <ChoiceCard checked={input.endsOn === null} onClick={() => set("endsOn", null)} title="No end date" hint="Free until an admin ends it." />
                  <ChoiceCard
                    checked={input.endsOn !== null}
                    onClick={() => set("endsOn", input.endsOn ?? "")}
                    title="Ends on a date"
                    hint="Then the club moves to Free."
                  />
                </div>
                {input.endsOn !== null ? (
                  <input
                    type="date"
                    className="input w-[200px]"
                    aria-label="Ends on"
                    min={today}
                    value={input.endsOn}
                    onChange={(e) => set("endsOn", e.target.value)}
                    aria-invalid={show("endsOn") ? true : undefined}
                  />
                ) : null}
                {show("endsOn") ? <span className="text-refuse text-[12px]">{show("endsOn")}</span> : null}
              </div>
            </>
          ) : null}

          {summary ? (
            <p role="status" className="bg-sunken text-ink m-0 flex items-center gap-2 rounded-[var(--radius-field)] px-3 py-2 text-[13px]">
              <GiftIcon className="text-brand size-4 shrink-0" aria-hidden="true" />
              <span>{summary}</span>
            </p>
          ) : null}

          {liveAsk ? (
            <Notice tone="caution" tag="Razorpay">
              This club pays through Razorpay. Cancel that subscription and give {what}?
            </Notice>
          ) : null}
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep as is
            </Button>
            <Button type="submit" disabled={assign.isPending || plans.isPending}>
              {assign.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {liveAsk ? `Cancel Razorpay and give ${what}` : input.complimentary ? "Give free plan" : "Give plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
