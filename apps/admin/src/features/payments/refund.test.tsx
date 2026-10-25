import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

/**
 * Refunding a payment from the Payments list.
 *
 * It moves real money and cannot be undone, so: owners only, only on a
 * payment the service will accept, a confirmation that says it is the full
 * amount, and a dialog that does not close as if it worked when it did not.
 * The request itself is pinned in critical-surfaces.test.ts.
 */
let role: string | null = "owner";
let refuse: Error | null = null;
const calls: Array<{ method: string; path: string; query?: Record<string, unknown> }> = [];

function payment(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    razorpay_payment_id: "pay_club1",
    status: "captured",
    amount: 250,
    payment_method: "upi",
    created_at: "2026-10-16T10:00:00+05:30",
    order_id: "o1",
    razorpay_order_id: "order_1",
    receipt: "rcpt_1",
    order_status: "paid",
    user: { id: 3, full_name: "Asha", email: "asha@example.com" },
    is_refundable: true,
    gateway: "club",
    ...over,
  };
}

const ROWS = [
  payment(),
  payment({ id: "p2", razorpay_payment_id: "pay_failed", status: "failed", is_refundable: false, user: { id: 4, full_name: "Ben", email: "ben@example.com" } }),
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role },
    }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path === "/api/v1/payments/admin/list") return { items: ROWS, total: ROWS.length, limit: 20, offset: 0, next: null };
        if (path === "/api/v1/payments/admin/totals") return { captured_total: 250, refunded_total: 0, net_total: 250, failed_count: 1 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        calls.push({ method: "POST", path });
        if (refuse) throw refuse;
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PaymentsTable } = await import("./index");

const posts = () => calls.filter((c) => c.method === "POST");
const listReads = () => calls.filter((c) => c.path === "/api/v1/payments/admin/list").length;
const rowOf = (payer: string) => screen.getByRole("link", { name: payer }).closest("tr")!;
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  role = "owner";
  refuse = null;
  calls.length = 0;
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

async function askToRefund() {
  render(<PaymentsTable />);
  await screen.findByRole("link", { name: "Asha" });
  fireEvent.click(within(rowOf("Asha")).getByRole("button", { name: /refund/i }));
  return screen.findByRole("alertdialog");
}

describe("refund a payment", () => {
  it("is offered only on a payment the service will refund", async () => {
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    expect(within(rowOf("Asha")).getByRole("button", { name: /refund/i })).toBeInTheDocument();
    expect(within(rowOf("Ben")).queryByRole("button", { name: /refund/i })).toBeNull();
  });

  it("is not offered to support, who can see the payment but not move money", async () => {
    role = "support";
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    expect(within(rowOf("Asha")).queryByRole("button", { name: /refund/i })).toBeNull();
  });

  it("confirms the full amount, that it cannot be undone and is logged; cancelling sends nothing", async () => {
    const confirm = await askToRefund();
    expect(within(confirm).getByRole("heading")).toHaveTextContent(/^Refund ₹\s?250(\.00)?\?$/);
    expect(within(confirm).getByText(/partial refunds are not supported/i)).toBeInTheDocument();
    expect(within(confirm).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(confirm).getByText(/recorded in the activity log/i)).toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(posts()).toEqual([]);
  });

  it("refunds by payment id, says so, closes and reloads the list", async () => {
    const confirm = await askToRefund();
    const before = listReads();
    fireEvent.click(within(confirm).getByRole("button", { name: "Refund in full" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Refund issued"));
    expect(posts()).toEqual([{ method: "POST", path: "/api/v1/payments/logs/p1/refund" }]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
  });

  it("keeps the dialog open and says why when Razorpay refuses", async () => {
    refuse = new Error("The payment has already been fully refunded");
    const confirm = await askToRefund();
    fireEvent.click(within(confirm).getByRole("button", { name: "Refund in full" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("The payment has already been fully refunded"));
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Refund in full" })).toBeEnabled();
  });
});
