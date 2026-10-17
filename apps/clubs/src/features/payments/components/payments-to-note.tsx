"use client";

import Link from "next/link";
import { LandmarkIcon } from "lucide-react";

import { useEventDetail } from "@/features/events/queries";

import { useGateway } from "../queries";
import { hasAccount, paymentsToOf, type Gateway, type PaymentsTo } from "../schemas";

const link = "text-brand underline-offset-2 hover:underline";

/** The words after "Payments go through MyOtherApp", by why that is. */
function platformReason(g: Gateway | undefined) {
  // Nothing to connect on this server, or nothing known.
  if (!g?.available) return null;
  // The club's account works, yet the server keeps this event on MyOtherApp's: its word stands, with nothing to fix.
  if (paymentsToOf(g) === "club") return null;
  if (hasAccount(g) && g.status === "failed") {
    return (
      <Link href="/payments" className={link}>
        fix your Razorpay connection
      </Link>
    );
  }
  // Turned off by MyOtherApp: the Payments page says why; connecting again is not the club's to do.
  if (hasAccount(g) && g.status === "disabled") return null;
  return (
    <Link href="/payments" className={link}>
      connect your own Razorpay
    </Link>
  );
}

/**
 * One line under the fee: whose Razorpay a ticket payment lands in.
 *
 * Editing, it is the server's word for this event (`payments_to` on its
 * detail); creating, or from a server that does not say, it is worked out
 * from the club's gateway. Says nothing until one of them is known.
 */
export function PaymentsToNote({ eventId }: { eventId?: number }) {
  const gateway = useGateway().data;
  const detail = useEventDetail(eventId ?? 0);
  // Editing, the event's word is waited for: the club's account may not be where this event's money goes.
  if (eventId && detail.isPending) return null;
  const to: PaymentsTo | null = (eventId ? detail.data?.payments_to : null) ?? (gateway ? paymentsToOf(gateway) : null);
  if (!to) return null;
  const reason = to === "platform" ? platformReason(gateway) : null;

  return (
    <p className="text-ink-2 m-0 mt-2 flex items-start gap-1.5 text-[12.5px] leading-[1.45]" data-payments-to={to}>
      <LandmarkIcon className="text-ink-3 mt-px size-3.5 shrink-0" aria-hidden="true" />
      {to === "club" ? (
        <span>Payments go to your Razorpay{gateway?.key_id ? ` (${gateway.key_id})` : ""}</span>
      ) : reason ? (
        <span>Payments go through MyOtherApp — {reason}</span>
      ) : (
        <span>Payments go through MyOtherApp</span>
      )}
    </p>
  );
}
