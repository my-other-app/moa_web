"use client";

import * as React from "react";
import { GiftIcon, Undo2Icon } from "lucide-react";
import { SectionTitle, formatDate } from "@moa/app-kit";
import {
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NativeSelect,
  Skeleton,
  StatusBadge,
} from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import {
  CHANNEL_TITLE,
  CREDIT_CHANNELS,
  LOT_LABEL,
  LOT_TONE,
  PURCHASE_LABEL,
  PURCHASE_TONE,
  grantProblems,
  proRataPaise,
  refundProblems,
  refundable,
  rupeesText,
  toGrantInput,
  toRefundInput,
  type AdminPurchase,
  type ChannelBalance,
  type ClubCredits,
  type CreditChannel,
  type GrantForm,
  type RefundForm,
} from "../credits";
import { useClubCredits, useGrantCredits, useRefundPurchase } from "../queries";

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-IN");

/**
 * A club's prepaid message credits, on its page: what is left per channel
 * (the plan's month, then bought), every lot it has had -- bought or granted,
 * active, used up, expired or refunded -- and its purchases.
 *
 * An admin who manages money grants free credits (with a reason, audited)
 * and refunds a purchase: the refund removes all of that purchase's unused
 * credits at once, then gives the money back through Razorpay (by default
 * the unused share of what was paid). Nothing here is shown on a backend
 * from before prepaid credits.
 */
export function ClubCreditsPanel({ clubId }: { clubId: number }) {
  const canMoney = useCan("manage_money");
  const q = useClubCredits(clubId);
  const data = q.data;
  const [refunding, setRefunding] = React.useState<AdminPurchase | null>(null);

  // A backend from before prepaid credits: no section at all.
  if (data === null) return null;

  return (
    <section className="space-y-3" aria-label="Message credits">
      <SectionTitle>Message credits</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {q.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : q.isError || !data ? (
            <p className="text-muted-foreground text-sm">Could not load the club&apos;s credits.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {CREDIT_CHANNELS.map((ch) => (
                  <Balance key={ch} channel={ch} b={data.channels[ch]} />
                ))}
              </div>
              <Lots data={data} />
              <Purchases data={data} canRefund={canMoney} onRefund={setRefunding} />
              {canMoney ? (
                <GrantCredits clubId={clubId} />
              ) : (
                <span className="text-muted-foreground text-xs">Only admins who manage money can grant credits or refund a purchase.</span>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {refunding ? <RefundDialog clubId={clubId} purchase={refunding} onClose={() => setRefunding(null)} /> : null}
    </section>
  );
}

function Balance({ channel, b }: { channel: CreditChannel; b: ChannelBalance }) {
  const plan = b.plan.limit === null ? "no limit" : `${n(b.plan.used)} / ${n(b.plan.limit)} used, ${n(b.plan.remaining)} left`;
  return (
    <div className="flex flex-col gap-0.5 text-sm" role="group" aria-label={`${CHANNEL_TITLE[channel]} balance`}>
      <span className="font-medium">{CHANNEL_TITLE[channel]}</span>
      <span className="text-muted-foreground text-xs">This month on the plan: {plan}</span>
      <span className="text-muted-foreground text-xs">
        Bought: {n(b.bought.remaining)} left{b.bought.next_expiry ? ` · next expiry ${formatDate(b.bought.next_expiry)}` : ""}
        {b.bought.low ? " · running low" : ""}
      </span>
      <span className="text-xs">Total left: {b.total_remaining === null ? "no limit" : n(b.total_remaining)}</span>
    </div>
  );
}

function Lots({ data }: { data: ClubCredits }) {
  if (!data.lots.length) return <p className="text-muted-foreground text-xs">No credits bought or granted yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" aria-label="Credit lots">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Channel</th>
            <th className="py-1.5 pr-3 font-medium">Source</th>
            <th className="py-1.5 pr-3 font-medium">Left</th>
            <th className="py-1.5 pr-3 font-medium">Added</th>
            <th className="py-1.5 pr-3 font-medium">Expires</th>
            <th className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.lots.map((lot) => (
            <tr key={lot.id} className="border-t align-top">
              <td className="py-1.5 pr-3">{CHANNEL_TITLE[lot.channel]}</td>
              <td className="py-1.5 pr-3">
                {lot.source === "grant" ? (
                  <span className="flex flex-col">
                    <span>Granted{lot.granted_by?.name ? ` by ${lot.granted_by.name}` : ""}</span>
                    {lot.reason ? <span className="text-muted-foreground text-xs">{lot.reason}</span> : null}
                  </span>
                ) : (
                  `Bought${lot.purchase_id ? ` (#${lot.purchase_id})` : ""}`
                )}
              </td>
              <td className="py-1.5 pr-3 tabular-nums">
                {n(lot.remaining)} / {n(lot.quantity)}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(lot.bought_at)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(lot.expires_at)}</td>
              <td className="py-1.5">
                <StatusBadge label={LOT_LABEL[lot.status]} tone={LOT_TONE[lot.status]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Purchases({ data, canRefund, onRefund }: { data: ClubCredits; canRefund: boolean; onRefund: (p: AdminPurchase) => void }) {
  if (!data.purchases.length) return <p className="text-muted-foreground text-xs">No purchases yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" aria-label="Credit purchases">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Receipt</th>
            <th className="py-1.5 pr-3 font-medium">Pack</th>
            <th className="py-1.5 pr-3 font-medium">Paid</th>
            <th className="py-1.5 pr-3 font-medium">Amount</th>
            <th className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.purchases.map((p) => (
            <tr key={p.id} className="border-t align-top">
              <td className="py-1.5 pr-3 whitespace-nowrap">{p.receipt_number || `#${p.id}`}</td>
              <td className="py-1.5 pr-3">
                {n(p.quantity)} {p.channel === "email" ? "emails" : "WhatsApp"}
                {p.credits_remaining !== null && p.status === "paid" ? <span className="text-muted-foreground text-xs"> · {n(p.credits_remaining)} unused</span> : null}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{p.paid_at ? formatDate(p.paid_at) : "—"}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {rupeesText(p.amount_paise)}
                {p.refunded_paise ? <span className="text-muted-foreground text-xs"> · {rupeesText(p.refunded_paise)} back</span> : null}
              </td>
              <td className="py-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge label={PURCHASE_LABEL[p.status]} tone={PURCHASE_TONE[p.status]} />
                  {p.refund_error ? <span className="text-refuse text-xs">{p.refund_error}</span> : null}
                  {canRefund && refundable(p) ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRefund(p)} aria-label={`Refund ${p.receipt_number || p.id}`}>
                      <Undo2Icon className="size-3.5" /> {p.status === "refund_failed" ? "Try the refund again" : "Refund"}
                    </button>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefundDialog({ clubId, purchase, onClose }: { clubId: number; purchase: AdminPurchase; onClose: () => void }) {
  const refund = useRefundPurchase(clubId);
  const [form, setForm] = React.useState<RefundForm>({ reason: purchase.refund_reason ?? "", amount: "" });
  const problems = refundProblems(form, purchase);
  const [tried, setTried] = React.useState(false);
  const proRata = proRataPaise(purchase);
  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    refund.mutate({ purchaseId: purchase.id, ...toRefundInput(form) }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Refund {purchase.receipt_number || `purchase #${purchase.id}`}?</DialogTitle>
          <DialogDescription>
            All of its unused credits ({n(purchase.credits_remaining)} of {n(purchase.quantity)}) are removed at once, then the money goes back through Razorpay.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <div className="field">
            <label htmlFor="refund-amount">Amount (₹)</label>
            <input
              id="refund-amount"
              className="input"
              inputMode="decimal"
              value={form.amount}
              placeholder={`Pro-rata of the unused: ${rupeesText(proRata)}`}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              aria-invalid={Boolean(problems.amount)}
            />
            <span className="text-muted-foreground text-xs">Leave empty for the pro-rata amount. Paid {rupeesText(purchase.amount_paise)}.</span>
            {problems.amount ? <span className="text-refuse text-xs">{problems.amount}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="refund-reason">Reason</label>
            <input
              id="refund-reason"
              className="input"
              value={form.reason}
              placeholder="Why, for the audit log"
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              aria-invalid={tried && Boolean(problems.reason)}
            />
            {tried && problems.reason ? <span className="text-refuse text-xs">{problems.reason}</span> : null}
          </div>
        </div>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="btn btn-destructive btn-sm" disabled={refund.isPending} onClick={submit}>
            Refund
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BLANK_GRANT: GrantForm = { channel: "email", quantity: "", validMonths: "12", reason: "" };

function GrantCredits({ clubId }: { clubId: number }) {
  const grant = useGrantCredits(clubId);
  const [form, setForm] = React.useState<GrantForm>(BLANK_GRANT);
  const [tried, setTried] = React.useState(false);
  const problems = grantProblems(form);
  const show = (key: keyof GrantForm) => (tried && problems[key] ? <span className="text-refuse text-xs">{problems[key]}</span> : null);
  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    grant.mutate(toGrantInput(form), {
      onSuccess: () => {
        setForm(BLANK_GRANT);
        setTried(false);
      },
    });
  };
  return (
    <div className="flex flex-col gap-2.5 border-t pt-3" role="group" aria-label="Grant free credits">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <GiftIcon className="size-3.5" aria-hidden="true" /> Grant free credits
      </span>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="grant-channel">Channel</label>
          <NativeSelect id="grant-channel" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as CreditChannel }))}>
            {CREDIT_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_TITLE[ch]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="field">
          <label htmlFor="grant-quantity">Credits</label>
          <input id="grant-quantity" className="input" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          {show("quantity")}
        </div>
        <div className="field">
          <label htmlFor="grant-months">Valid for (months)</label>
          <input id="grant-months" className="input" inputMode="numeric" value={form.validMonths} onChange={(e) => setForm((f) => ({ ...f, validMonths: e.target.value }))} />
          {show("validMonths")}
        </div>
        <div className="field sm:col-span-3">
          <label htmlFor="grant-reason">Reason</label>
          <input id="grant-reason" className="input" value={form.reason} placeholder="Why, for the audit log" onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          {show("reason")}
        </div>
      </div>
      <div>
        <button type="button" className="btn btn-primary btn-sm" disabled={grant.isPending} onClick={submit}>
          Grant credits
        </button>
      </div>
    </div>
  );
}
