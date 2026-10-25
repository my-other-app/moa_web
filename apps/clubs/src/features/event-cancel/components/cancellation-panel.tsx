"use client";

import * as React from "react";
import { BanIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber } from "@moa/app-kit";
import { CardLabel, FigurePanel, Notice, ProgressBar } from "@moa/ui";

import { useRetryRefund } from "@/features/event-payments/queries";

import { useCancelState, useRetryCancelRefunds } from "../queries";

/**
 * A cancelled event's aftermath: why, when and by whom; how the guests were
 * told; how far the refunds have got; and the ones Razorpay did not take,
 * each to try again. Nothing shows for an event that is not cancelled, or on
 * a backend without cancelling.
 */
export function CancellationPanel({ eventId, canRetry = true }: { eventId: number; canRetry?: boolean }) {
  const q = useCancelState(eventId);
  const retryAll = useRetryCancelRefunds(eventId);
  const retryOne = useRetryRefund(eventId);
  const s = q.data;
  if (!s || !s.cancelled) return null;

  const r = s.refunds;
  const notice = s.notice;
  return (
    <FigurePanel className="grid gap-4 p-4" aria-label="Cancellation">
      <div>
        <CardLabel right={<span className="text-refuse inline-flex items-center gap-1 text-[12px] font-medium"><BanIcon className="size-3.5" /> Cancelled</span>}>
          This event was cancelled
        </CardLabel>
        <p className="text-ink-2 mt-1 text-[13px]">
          {s.cancelled_at ? formatDateTime(s.cancelled_at) : null}
          {s.cancelled_by ? ` by ${s.cancelled_by}` : null}
          {s.reason ? (
            <>
              {" "}
              — “<span className="text-ink">{s.reason}</span>”
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-1 text-[13px]">
        <span className="eyebrow">Guests told</span>
        <span className="text-ink-2">
          {formatNumber(s.registrations)} {s.registrations === 1 ? "guest" : "guests"} by email
          {notice?.push_sent ? `, ${formatNumber(notice.push_sent)} in the app` : ""}
          {notice?.whatsapp_sent ? `, ${formatNumber(notice.whatsapp_sent)} on WhatsApp` : ""}
          {notice?.whatsapp_skipped ? ` (${formatNumber(notice.whatsapp_skipped)} WhatsApp held back or unreachable)` : ""}. Each email&apos;s
          delivery is under Messages.
        </span>
      </div>

      {r.total > 0 ? (
        <div className="grid gap-2">
          <span className="eyebrow">Refunds</span>
          <ProgressBar value={r.succeeded} max={Math.max(1, r.total)} label="Refunds done" />
          <span className="text-ink-2 text-[13px]">
            {formatNumber(r.succeeded)} of {formatNumber(r.total)} refunded · {formatCurrency(r.refunded_amount)} of {formatCurrency(s.refund_total)}
            {r.pending ? ` · ${formatNumber(r.pending)} on the way` : ""}
            {r.pending ? <Loader2Icon aria-label="Refunds on the way" className="text-ink-3 ml-1.5 inline size-3.5 animate-spin" /> : null}
          </span>
        </div>
      ) : (
        <p className="text-ink-3 m-0 text-[12.5px]">No online payments to refund.</p>
      )}

      {s.paid_at_door > 0 ? (
        <Notice tone="caution">
          {formatNumber(s.paid_at_door)} {s.paid_at_door === 1 ? "guest" : "guests"} paid at the door ({formatCurrency(s.paid_at_door_total)}). Give that
          back by hand.
        </Notice>
      ) : null}

      {s.failures.length ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-refuse text-[13px] font-medium">
              {formatNumber(s.failures.length)} {s.failures.length === 1 ? "refund" : "refunds"} didn&apos;t go through
            </span>
            {canRetry ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={retryAll.isPending} onClick={() => retryAll.mutate()}>
                {retryAll.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <RotateCwIcon className="size-3.5" />} Try all again
              </button>
            ) : null}
          </div>
          <ul className="border-line-soft divide-line-soft divide-y rounded-xl border" aria-label="Refunds that failed">
            {s.failures.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-ink text-[13px] font-medium">
                    {f.full_name || f.email || "Guest"} · {formatCurrency(f.amount)}
                  </div>
                  <div className="text-ink-3 text-[11.5px]">
                    {f.error ?? "Razorpay didn't take it."} · tried {f.attempts}× · {f.gateway === "club" ? "your Razorpay" : "MyOtherApp's Razorpay"}
                  </div>
                </div>
                {canRetry ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Try the refund to ${f.full_name || f.email || "this guest"} again`}
                    disabled={retryOne.isPending || retryAll.isPending}
                    onClick={() => retryOne.mutate(f.id)}
                  >
                    <RotateCwIcon className="size-3.5" /> Try again
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </FigurePanel>
  );
}
