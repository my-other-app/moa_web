import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * Refunds beyond a full one: part of a ticket, one store order, the rest of
 * a payment, and a plan charge. Owners only, a reason every time, and only
 * on a backend that has them.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, refusal } = await import("@/test/fake-api");
const { PaymentsTable } = await import("@/features/payments");
const { ChargesPanel } = await import("@/features/revenue");

const PAYMENT = {
  id: "p1",
  razorpay_payment_id: "pay_1",
  status: "captured",
  amount: 600,
  payment_method: "upi",
  created_at: "2026-10-16T10:00:00+05:30",
  order_id: "o1",
  razorpay_order_id: "order_1",
  receipt: "rcpt_1",
  order_status: "paid",
  user: { id: 3, full_name: "Asha", email: "asha@example.com" },
  is_refundable: true,
  gateway: "platform",
};

const DETAIL = {
  payment: { id: "p1", razorpay_payment_id: "pay_1", status: "captured", amount: 600, refunded: 0, refundable: 600, gateway: "platform" },
  ticket: { registration_id: "r1", name: "Asha", paid_amount: 500, price: 500, is_paid: true },
  store_orders: [{ id: "o-1", status: "paid", total: 100, summary: "1 × T-shirt (M)", handed_over: false, refundable: true }],
  refunds: [],
};

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/payments/admin/list"] = () => ({ items: [PAYMENT], total: 1, limit: 20, offset: 0, next: null });
  state.handlers["GET /api/v1/payments/admin/totals"] = () => ({ captured_total: 600, refunded_total: 0, net_total: 600, failed_count: 0 });
  state.handlers["GET /api/v1/admin/refunds/payments/p1"] = () => DETAIL;
  state.handlers["POST /api/v1/admin/refunds/payments/p1"] = () => DETAIL;
  state.handlers["GET /api/v1/admin/revenue/charges"] = () => ({
    items: [
      { id: 7, club: { id: 5, name: "Circuit" }, plan_name: "Pro", cycle: "monthly", amount_paise: 99900, refunded_paise: 0, status: "captured", razorpay_payment_id: "pay_sub", charged_at: "2026-10-01T00:00:00Z" },
      { id: 8, club: { id: 6, name: "Drama" }, plan_name: "Pro", cycle: "monthly", amount_paise: 99900, refunded_paise: 0, status: "failed", razorpay_payment_id: "pay_fail", charged_at: "2026-10-01T00:00:00Z" },
    ],
    total: 2,
    sum_paise: 99900,
    refunded_paise: 0,
    offset: 0,
    limit: 20,
  });
  state.handlers["POST /api/v1/admin/refunds/subscription-charges/7"] = () => ({ id: 7, amount_paise: 99900, refunded_paise: 50000, status: "partially_refunded", razorpay_payment_id: "pay_sub", refund_id: "rfnd_1" });
});

async function openPartRefund() {
  render(<PaymentsTable />);
  const payer = await screen.findByRole("link", { name: "Asha" });
  fireEvent.click(await within(payer.closest("tr")!).findByRole("button", { name: "Refund part…" }));
  return screen.findByRole("dialog");
}

describe("refunding part of a payment", () => {
  it("is not offered on a backend without it, nor to support", async () => {
    state.ops = null;
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    expect(screen.queryByRole("button", { name: "Refund part…" })).toBeNull();
  });

  it("gives back part of the ticket, with a reason", async () => {
    const dialog = await openPartRefund();
    expect(await within(dialog).findByText(/left to refund/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Amount to give back (₹)"), { target: { value: "150" } });
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Early bird price agreed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/refunds/payments/p1")).toHaveLength(1));
    expect(callsOf(state, "POST", "/api/v1/admin/refunds/payments/p1")[0]!.body).toEqual({ kind: "ticket", amount: 150, reason: "Early bird price agreed" });
  });

  it("refuses the whole ticket as 'part', pointing to the rest", async () => {
    const dialog = await openPartRefund();
    await within(dialog).findByText(/left to refund/);
    fireEvent.change(within(dialog).getByLabelText("Amount to give back (₹)"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Changed plans" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    expect(await within(dialog).findByText(/refund the rest/)).toBeInTheDocument();
    expect(callsOf(state, "POST")).toEqual([]);
  });

  it("refunds one store order", async () => {
    const dialog = await openPartRefund();
    await within(dialog).findByText(/left to refund/);
    fireEvent.click(within(dialog).getByRole("radio", { name: /A store order/ }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /T-shirt/ }));
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Size out of stock" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/refunds/payments/p1")[0]!.body).toEqual({ kind: "store_order", store_order_id: "o-1", reason: "Size out of stock" }));
  });

  it("keeps the dialog open with Razorpay's refusal", async () => {
    state.handlers["POST /api/v1/admin/refunds/payments/p1"] = () => {
      throw refusal(502, "Razorpay did not take the refund: insufficient balance", "REFUND_FAILED");
    };
    const dialog = await openPartRefund();
    await within(dialog).findByText(/left to refund/);
    fireEvent.click(within(dialog).getByRole("radio", { name: /The rest of the payment/ }));
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Event cancelled" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/refunds/payments/p1")[0]!.body).toEqual({ kind: "rest", reason: "Event cancelled" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("refunding a plan charge", () => {
  it("is offered on a charge with money left, not on a failed one", async () => {
    render(<ChargesPanel months={[]} />);
    await screen.findByText("Circuit");
    const refunds = await screen.findAllByRole("button", { name: "Refund…" });
    expect(refunds).toHaveLength(1);
  });

  it("refunds part of a charge, with a reason", async () => {
    render(<ChargesPanel months={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refund…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Charged before the downgrade" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/refunds/subscription-charges/7")[0]!.body).toEqual({ amount: 500, reason: "Charged before the downgrade" }));
  });

  it("refunds all that is left when no amount is given", async () => {
    render(<ChargesPanel months={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refund…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Duplicate charge" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund$/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/refunds/subscription-charges/7")[0]!.body).toEqual({ reason: "Duplicate charge" }));
  });

  it("is not offered to support", async () => {
    state.role = "support";
    render(<ChargesPanel months={[]} />);
    await screen.findByText("Circuit");
    expect(screen.queryByRole("button", { name: "Refund…" })).toBeNull();
  });
});
