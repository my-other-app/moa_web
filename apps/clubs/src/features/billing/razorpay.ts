/**
 * Razorpay Checkout, in subscription mode.
 *
 * The script is fetched only when someone actually starts a checkout, so
 * the dashboard never loads a payment provider's code for a page view.
 * Nothing here moves money on its own: checkout asks the club to authorise
 * a subscription the server already created, and the result arrives at the
 * server as a webhook. What the handler hands back is only a hint that the
 * club finished; the plan changes when Razorpay tells the server so.
 */

export const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { email?: string; contact?: string; name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: { razorpay_payment_id?: string; razorpay_subscription_id?: string; razorpay_signature?: string }) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/**
 * The public key the checkout opens with: what the server sent, else this
 * build's NEXT_PUBLIC_RAZORPAY_KEY_ID. Read at call time, not at import, so
 * a test (or a misconfigured build) sees the value it has now.
 */
export function checkoutKey(fromServer?: string | null): string | null {
  return fromServer || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null;
}

let loading: Promise<boolean> | null = null;

/** Adds the checkout script once. Resolves false when it cannot load (blocked, offline). */
export function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      loading = null; // a later click may try again
      script.remove();
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loading;
}

export type CheckoutOutcome = { kind: "authorised"; paymentId: string | null } | { kind: "dismissed" } | { kind: "unavailable" };

/** Opens the checkout for a subscription and settles once the club is done with it. */
export async function openSubscriptionCheckout(input: {
  key: string;
  subscriptionId: string;
  description: string;
  email?: string | null;
  phone?: string | null;
}): Promise<CheckoutOutcome> {
  if (!(await loadCheckout()) || !window.Razorpay) return { kind: "unavailable" };
  const Razorpay = window.Razorpay;
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const checkout = new Razorpay({
      key: input.key,
      subscription_id: input.subscriptionId,
      name: "MyOtherApp",
      description: input.description,
      prefill: { email: input.email ?? undefined, contact: input.phone ?? undefined },
      theme: { color: "#17a58f" },
      handler: (response) => settle({ kind: "authorised", paymentId: response.razorpay_payment_id ?? null }),
      modal: { ondismiss: () => settle({ kind: "dismissed" }) },
    });
    // A declined card keeps the modal open for another try, so it is not an
    // outcome of its own: closing the modal after it is, and ondismiss says so.
    checkout.open();
  });
}
