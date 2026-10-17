import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

/**
 * The Payments list's "Goes to": whose Razorpay took each payment
 * (`gateway: "club" | "platform"` on the rows of GET /payments/admin/list),
 * the filter for it, and the totals split the same way (`platform` and
 * `club` on GET /payments/admin/totals, each with the four top-level fields).
 */
let search = "";
const TOTALS = { captured_total: 750, refunded_total: 100, net_total: 650, failed_count: 2 };
let totals: Record<string, unknown> = TOTALS;
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];

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
  payment({ id: "p2", razorpay_payment_id: "pay_platform2", user: { id: 4, full_name: "Ben", email: "ben@example.com" }, gateway: "platform" }),
  // From a server that does not say.
  payment({ id: "p3", razorpay_payment_id: "pay_old3", user: { id: 5, full_name: "Cyd", email: "cyd@example.com" }, gateway: undefined }),
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: "owner" } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/payments/admin/list") return { items: ROWS, total: ROWS.length, limit: 20, offset: 0, next: null };
        if (path === "/api/v1/payments/admin/totals") return totals;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PaymentsTable, paymentSchema, gatewayLabel } = await import("./index");

beforeEach(() => {
  totals = TOTALS;
  search = "";
  gets.length = 0;
});

const listCalls = () => gets.filter((g) => g.path === "/api/v1/payments/admin/list");
const rowOf = (payer: string) => screen.getByRole("link", { name: payer }).closest("tr")!;

describe("where a payment went", () => {
  it("is read from the row, and absent from a server that does not say", () => {
    expect(paymentSchema.parse(payment()).gateway).toBe("club");
    expect(paymentSchema.parse(payment({ gateway: "platform" })).gateway).toBe("platform");
    expect(paymentSchema.parse(payment({ gateway: undefined })).gateway ?? null).toBeNull();
    expect(paymentSchema.parse(payment({ gateway: "somewhere_else" })).gateway).toBeNull();
    expect(gatewayLabel("club")).toBe("Club");
    expect(gatewayLabel("platform")).toBe("MyOtherApp");
    expect(gatewayLabel(null)).toBeNull();
  });

  it("shows in a Goes to column: Club, MyOtherApp, or nothing", async () => {
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    expect(screen.getByRole("columnheader", { name: "Goes to" })).toBeInTheDocument();
    expect(within(rowOf("Asha")).getByText("Club")).toBeInTheDocument();
    expect(within(rowOf("Ben")).getByText("MyOtherApp")).toBeInTheDocument();
    expect(within(rowOf("Cyd")).queryByText("Club")).not.toBeInTheDocument();
    expect(within(rowOf("Cyd")).queryByText("MyOtherApp")).not.toBeInTheDocument();
  });

  it("filters through the URL, and asks the server with it", async () => {
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    expect(screen.getByRole("combobox", { name: "Goes to" })).toBeInTheDocument();
    expect(listCalls()[0]!.query).toMatchObject({ gateway: undefined });
  });

  it("reads the filter from the URL", async () => {
    search = "gateway=club&status=captured";
    render(<PaymentsTable />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0]!.query).toMatchObject({ gateway: "club", status: "captured" });
  });
});

describe("the totals' split", () => {
  it("shows MyOtherApp's account beside the clubs' own accounts", async () => {
    totals = {
      ...TOTALS,
      platform: { captured_total: 500, refunded_total: 100, net_total: 400, failed_count: 2 },
      club: { captured_total: 250, refunded_total: 0, net_total: 250, failed_count: 0 },
    };
    render(<PaymentsTable />);
    const split = await screen.findByRole("group", { name: "Split by account" });
    const line = (label: string) => within(split).getByText(label).closest("div")!;
    expect(line("MyOtherApp's account")).toHaveTextContent(/500.* captured · .*100.* refunded · .*400.* net · 2 failed/);
    expect(line("Clubs' own accounts")).toHaveTextContent(/250.* captured · .*0.* refunded · .*250.* net$/);
  });

  it("is left out by a server that does not split", async () => {
    render(<PaymentsTable />);
    await screen.findByRole("link", { name: "Asha" });
    await waitFor(() => expect(gets.some((g) => g.path === "/api/v1/payments/admin/totals")).toBe(true));
    expect(screen.queryByRole("group", { name: "Split by account" })).not.toBeInTheDocument();
  });
});
