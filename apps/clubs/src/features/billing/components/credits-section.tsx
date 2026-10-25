"use client";

import * as React from "react";
import { GiftIcon, Loader2Icon, MailIcon, MessageCircleIcon, PrinterIcon, ReceiptIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import {
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  Notice,
  ProgressBar,
  Skeleton,
  StatusBadge,
  cn,
  type NoticeTone,
} from "@moa/ui";

import { useAccess } from "@/features/access";

import {
  CREDIT_CHANNELS,
  CREDIT_TITLE,
  creditErrorText,
  messagesText,
  packsFor,
  perMessageText,
  purchaseStatusText,
  rupeesText,
  type ChannelCredits,
  type CreditChannel,
  type CreditPack,
  type CreditPurchase,
  type CreditReceipt,
} from "../credits";
import { useCreateCreditOrder, useCreditReceipt, useCredits, useVerifyCreditPayment } from "../queries";
import { checkoutKey, openOrderCheckout } from "../razorpay";

/** How long the area keeps asking after a payment Razorpay has not confirmed yet. */
const WATCH_MS = 2 * 60_000;

type Outcome = { tone: NoticeTone; text: string };

/**
 * Message credits, on Billing (`#credits`): this month's plan allowance per
 * channel, the credits bought (each lot with what is left and when it
 * expires), the packs on sale and the purchases with their receipts.
 *
 * Only the club's own account buys: a pack is a one-time Razorpay payment
 * (checkout in order mode). What checkout's handler hands back is only a
 * hint the server verifies with Razorpay; the credits are added once it has,
 * and the area polls for a while when Razorpay has not confirmed yet.
 *
 * On a backend from before prepaid credits (the route answers a bare 404)
 * the area is not shown at all; it appears by itself once that backend is
 * deployed.
 */
export function CreditsSection() {
  const access = useAccess();
  // Mirrors the server: only the club's own account may buy credits.
  const canBuy = access.role === "owner";
  const [watchRound, setWatchRound] = React.useState(0);
  const [waitingFor, setWaitingFor] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [receiptFor, setReceiptFor] = React.useState<number | null>(null);
  const order = useCreateCreditOrder();
  const verify = useVerifyCreditPayment();

  // Polled while a payment is being confirmed; the purchase waited for, once
  // the server has it paid, is said and the polling stops.
  const credits = useCredits(watchRound > 0 ? waitingFor : null);
  const c = credits.data;
  const confirmed = waitingFor !== null ? c?.purchases.find((p) => p.id === waitingFor && p.status === "paid") : undefined;
  const watching = watchRound > 0 && waitingFor !== null && !confirmed;

  React.useEffect(() => {
    if (watchRound === 0) return;
    const t = window.setTimeout(() => setWatchRound(0), WATCH_MS);
    return () => window.clearTimeout(t);
  }, [watchRound]);

  const buy = async (pack: CreditPack) => {
    setOutcome(null);
    setWaitingFor(null);
    setBusy(pack.id);
    try {
      const made = await order.mutateAsync(pack.id);
      const key = made.key_id || checkoutKey();
      const result = key
        ? await openOrderCheckout({
            key,
            orderId: made.razorpay_order_id,
            amount: made.amount_paise,
            currency: made.currency,
            name: made.name,
            description: made.description || `${messagesText(pack.channel, pack.quantity)} credits`,
            email: made.prefill?.email,
            phone: made.prefill?.contact,
            payer: made.prefill?.name,
          })
        : ({ kind: "unavailable" } as const);
      if (result.kind === "dismissed") {
        setOutcome({ tone: "caution", text: "Checkout was closed before paying, so nothing was charged." });
        return;
      }
      if (result.kind === "unavailable") {
        setOutcome({ tone: "caution", text: "Razorpay's checkout couldn't open here (a browser setting or extension may be blocking it). Nothing was charged; try again, or from another browser." });
        return;
      }
      try {
        const bought = await verify.mutateAsync({ orderId: result.orderId, paymentId: result.paymentId, signature: result.signature });
        if (bought.status === "paid") {
          setOutcome({ tone: "admit", text: `Payment received: ${messagesText(bought.channel, bought.quantity)} added to your credits. Receipt ${bought.receipt_number}.` });
        } else {
          setOutcome({ tone: "accent", text: "Payment received. Razorpay is confirming it, and your credits appear here when it has — usually within a minute." });
          setWaitingFor(bought.id);
          setWatchRound((r) => r + 1);
        }
      } catch (error) {
        // Razorpay may still have taken it: the webhook adds the credits, so keep looking.
        setOutcome({ tone: "caution", text: creditErrorText(error) });
        setWaitingFor(made.purchase_id);
        setWatchRound((r) => r + 1);
      }
    } catch (error) {
      setOutcome({ tone: "refuse", text: creditErrorText(error) });
    } finally {
      setBusy(null);
    }
  };

  if (credits.isPending) return <Skeleton className="h-[240px] rounded-2xl" />;
  // null: the backend has no prepaid credits yet.
  if (c === null) return null;

  const shown: Outcome | null = confirmed
    ? { tone: "admit", text: `Payment confirmed: ${messagesText(confirmed.channel, confirmed.quantity)} added to your credits. Receipt ${confirmed.receipt_number}.` }
    : outcome;

  return (
    <section id="credits" aria-labelledby="credits-title" className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h3 id="credits-title" className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em]">
            Message credits
          </h3>
          <p className="text-ink-3 mt-0.5 text-[12.5px]">
            Each month your plan&apos;s allowance is used first, then bought credits, the ones expiring soonest first.
            {c ? ` Bought credits last ${c.validity_months} months.` : ""}
          </p>
        </div>
        {watching ? (
          <span className="text-ink-3 flex items-center gap-1.5 text-[12.5px]" role="status">
            <Loader2Icon className="size-3.5 animate-spin" /> Waiting for Razorpay to confirm…
          </span>
        ) : null}
      </div>

      {shown ? <Notice tone={shown.tone}>{shown.text}</Notice> : null}

      {credits.isError || !c ? (
        <FigurePanel className="p-4" role="region" aria-label="Message credits">
          <p className="text-ink-3 m-0 text-[12.5px]">Could not load your credits. Try reloading the page.</p>
        </FigurePanel>
      ) : (
        <>
          <div className="grid gap-3.5 md:grid-cols-2">
            {CREDIT_CHANNELS.map((ch) => (
              <ChannelCard
                key={ch}
                channel={ch}
                c={c.channels[ch]}
                packs={packsFor(c, ch)}
                canBuy={canBuy && c.can_buy}
                owner={canBuy}
                saleOpen={c.can_buy}
                busy={busy}
                onBuy={buy}
              />
            ))}
          </div>

          <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
            {c.prices_include_gst ? "Prices include GST. " : "Prices are before GST. "}
            Credits last {c.validity_months} months from purchase and are used for one channel only. With no credits left, announcements, campaigns and
            reminders pause; tickets, certificates and payment messages always go and are never charged.
            {!canBuy && access.known ? " Only the club's own account can buy credits." : ""}
          </p>

          <Purchases items={c.purchases} onReceipt={setReceiptFor} />
        </>
      )}

      <ReceiptDialog purchaseId={receiptFor} onClose={() => setReceiptFor(null)} />
    </section>
  );
}

function ChannelCard({
  channel,
  c,
  packs,
  canBuy,
  owner,
  saleOpen,
  busy,
  onBuy,
}: {
  channel: CreditChannel;
  c: ChannelCredits;
  packs: CreditPack[];
  canBuy: boolean;
  owner: boolean;
  saleOpen: boolean;
  busy: number | null;
  onBuy: (pack: CreditPack) => void;
}) {
  const Icon = channel === "email" ? MailIcon : MessageCircleIcon;
  const title = CREDIT_TITLE[channel];
  const { plan, bought } = c;
  const planLine =
    plan.limit === null
      ? "No limit on your plan"
      : plan.limit === 0
        ? "Not included on your plan"
        : `${plan.used.toLocaleString("en-IN")} of ${plan.limit.toLocaleString("en-IN")} used · ${(plan.remaining ?? 0).toLocaleString("en-IN")} left`;
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label={`${title} credits`}>
      <CardLabel
        right={
          <span className="text-ink-2 text-[12px] tabular-nums">
            {c.total_remaining === null ? "No limit" : `${c.total_remaining.toLocaleString("en-IN")} left in all`}
          </span>
        }
      >
        <span className="flex items-center gap-1.5">
          <Icon className="text-ink-3 size-3.5" aria-hidden="true" /> {title}
        </span>
      </CardLabel>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-ink font-medium">This month on your plan</span>
          <span className="text-ink-2 shrink-0 tabular-nums">{planLine}</span>
        </div>
        {plan.limit !== null && plan.limit > 0 ? (
          <ProgressBar
            value={Math.min(plan.used, plan.limit)}
            max={plan.limit}
            tone={plan.remaining === 0 ? "caution" : "accent"}
            height={6}
            label={`${title} on your plan: ${plan.used} of ${plan.limit} this month`}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-ink font-medium">Bought credits</span>
          <span className="text-ink-2 shrink-0 tabular-nums">{bought.remaining.toLocaleString("en-IN")} left</span>
        </div>
        {c.lots.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`${title} credit lots`}>
            {c.lots.map((lot) => (
              <li key={lot.id} className="text-ink-2 flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                <span className="tabular-nums">
                  {lot.remaining.toLocaleString("en-IN")} of {lot.quantity.toLocaleString("en-IN")} left
                  {lot.source === "grant" ? (
                    <span className="text-brand ml-1.5 inline-flex items-center gap-1 text-[11.5px]">
                      <GiftIcon className="size-3" aria-hidden="true" /> Free credits from MyOtherApp
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-3">{lot.expires_at ? `Expires ${formatDate(lot.expires_at)}` : null}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 m-0 text-[12px]">None bought yet.</p>
        )}
        {bought.low ? <p className="text-caution m-0 text-[12px]">Running low: less than a tenth of your last pack is left.</p> : null}
      </div>

      {packs.length ? (
        <div className="border-line-soft flex flex-col gap-1.5 border-t pt-3">
          <span className="eyebrow">Buy {title} credits</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={`${title} packs`}>
            {packs.map((pack) => (
              <li key={pack.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="flex flex-col">
                  <span className="text-ink font-medium">{messagesText(channel, pack.quantity)}</span>
                  <span className="text-ink-3 text-[11.5px]">{perMessageText(pack)}</span>
                </span>
                {canBuy ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy !== null}
                    onClick={() => onBuy(pack)}
                    aria-label={`Buy ${messagesText(channel, pack.quantity)} for ${rupeesText(pack.price_paise)}`}
                  >
                    {busy === pack.id ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                    Buy · {rupeesText(pack.price_paise)}
                  </button>
                ) : (
                  <span className="text-ink tabular-nums">{rupeesText(pack.price_paise)}</span>
                )}
              </li>
            ))}
          </ul>
          {owner && !saleOpen ? <p className="text-ink-3 m-0 text-[12px]">Buying credits isn&apos;t available right now. Try again later.</p> : null}
        </div>
      ) : null}
    </FigurePanel>
  );
}

const STATUS_TONE: Record<CreditPurchase["status"], "default" | "success" | "warning" | "destructive" | "info"> = {
  created: "default",
  paid: "success",
  refunding: "info",
  refund_failed: "info",
  refunded: "default",
};

function Purchases({ items, onReceipt }: { items: CreditPurchase[]; onReceipt: (id: number) => void }) {
  return (
    <FigurePanel className="flex flex-col gap-2 p-4" role="region" aria-label="Credit purchases">
      <CardLabel>Purchases</CardLabel>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Purchases">
          {items.map((p) => (
            <li key={p.id} className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-b py-2 text-[12.5px] last:border-0">
              <span className="flex min-w-0 flex-col">
                <span className="text-ink font-medium">{messagesText(p.channel, p.quantity)}</span>
                <span className="text-ink-3 text-[11.5px]">
                  {formatDate(p.paid_at ?? p.created_at)}
                  {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                  {p.status === "paid" && p.expires_at ? ` · expires ${formatDate(p.expires_at)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-ink tabular-nums">{rupeesText(p.amount_paise)}</span>
                <StatusBadge label={purchaseStatusText(p)} tone={STATUS_TONE[p.status]} />
                {p.status !== "created" ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReceipt(p.id)} aria-label={`Receipt ${p.receipt_number || p.id}`}>
                    <ReceiptIcon className="size-3.5" aria-hidden="true" /> Receipt
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3 m-0 text-[12.5px]">No purchases yet. Packs you buy show here, each with its receipt.</p>
      )}
    </FigurePanel>
  );
}

function ReceiptDialog({ purchaseId, onClose }: { purchaseId: number | null; onClose: () => void }) {
  const receipt = useCreditReceipt(purchaseId);
  const r = receipt.data;
  return (
    <Dialog open={purchaseId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Receipt{r?.receipt_number ? ` ${r.receipt_number}` : ""}</DialogTitle>
          <DialogDescription>Message credits bought from MyOtherApp.</DialogDescription>
        </DialogHeader>
        {receipt.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : receipt.isError || !r ? (
          <p className="text-ink-3 text-[12.5px]">Could not load this receipt. Try again in a moment.</p>
        ) : (
          <ReceiptBody r={r} />
        )}
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!r} onClick={() => r && printReceipt(r)}>
            <PrinterIcon className="size-3.5" aria-hidden="true" /> Print
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The receipt's lines, as label and value, for the dialog and the printed page alike. */
export function receiptRows(r: CreditReceipt): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Receipt", r.receipt_number],
    ["Date", formatDate(r.issued_at)],
    ["From", [r.seller.name, r.seller.website, r.seller.email].filter(Boolean).join(" · ")],
    ["Billed to", [r.club.name, r.club.email].filter(Boolean).join(" · ")],
    ["Item", r.item || `${messagesText(r.channel, r.quantity)} credits`],
    ["Amount", `${rupeesText(r.amount_paise)}${r.prices_include_gst ? " (includes GST)" : " (before GST)"}`],
  ];
  if (r.payment_method || r.razorpay_payment_id) rows.push(["Paid by", [r.payment_method?.toUpperCase(), r.razorpay_payment_id].filter(Boolean).join(" · ")]);
  if (r.expires_at) rows.push(["Credits expire", formatDate(r.expires_at)]);
  if (r.refunded_paise > 0) rows.push(["Refunded", `${rupeesText(r.refunded_paise)}${r.refunded_at ? ` on ${formatDate(r.refunded_at)}` : ""}`]);
  return rows.filter(([, v]) => Boolean(v));
}

function ReceiptBody({ r }: { r: CreditReceipt }) {
  return (
    <dl className={cn("m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]")} aria-label="Receipt details">
      {receiptRows(r).map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-ink-3">{label}</dt>
          <dd className="text-ink m-0 tabular-nums">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** The receipt on a page of its own, printed (or saved as a PDF) from the browser's dialog. */
export function printReceipt(r: CreditReceipt): void {
  const page = window.open("", "_blank", "noopener=no,width=640,height=720");
  if (!page) return;
  const rows = receiptRows(r)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  page.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`Receipt ${r.receipt_number}`)}</title>` +
      `<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:40px}h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0 0 24px}` +
      `table{border-collapse:collapse;width:100%}th{text-align:left;color:#555;font-weight:500;padding:6px 16px 6px 0;vertical-align:top;white-space:nowrap}td{padding:6px 0}</style>` +
      `</head><body><h1>${escapeHtml(r.seller.name || "MyOtherApp")}</h1><p>Receipt for message credits</p><table>${rows}</table></body></html>`,
  );
  page.document.close();
  page.focus();
  page.print();
}
