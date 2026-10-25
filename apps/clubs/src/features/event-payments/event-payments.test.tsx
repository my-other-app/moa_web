import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * An event's payments, for the owner and admins: each guest's payment, a
 * refund of all or part of it with a reason, through whichever Razorpay
 * account took it, and the refunds Razorpay did not take, to try again.
 */
const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
let me: unknown = null;
let server: "old" | "new" = "new";
let answer: (path: string, body: Record<string, unknown>) => unknown;

const refundOf = (over: Record<string, unknown> = {}) => ({
  id: "rf-1", amount: 500, reason: "Couldn't come", status: "succeeded", source: "club", error: null, created_at: "2026-10-20T10:00:00+00:00", by: "Circuit Society", ...over,
});
const payment = (over: Record<string, unknown> = {}) => ({
  id: "pl-asha", registration_id: "r-asha", ticket_id: "MOA-1", guest_name: "Asha Menon", guest_email: "asha@example.com",
  amount: 500, refunded: 0, refundable: 500, method: "upi", status: "captured", paid_at: "2026-10-18T09:30:00+00:00", gateway: "platform", refunds: [], ...over,
});
const PAYMENTS = () => ({
  items: [
    payment(),
    payment({ id: "pl-ravi", registration_id: "r-ravi", guest_name: "Ravi Das", guest_email: "ravi@example.com", gateway: "club", refunded: 200, refundable: 300, status: "partially_refunded", refunds: [refundOf({ id: "rf-ravi", amount: 200, reason: "Late refund ask" })] }),
    payment({ id: "pl-joe", guest_name: "Joe", status: "refunded", refunded: 500, refundable: 0, refunds: [refundOf({ id: "rf-joe" })] }),
    payment({ id: "pl-mia", guest_name: "Mia", refunds: [refundOf({ id: "rf-mia", amount: 500, status: "failed", error: "The payment is too old to refund" })] }),
  ],
  totals: { payments: 4, captured: 2000, refunded: 700 },
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        if (path === "/api/v1/events/37/payments") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return PAYMENTS();
        }
        if (path === "/api/v1/events/37/cancel") return { status: "published", cancelled: false, can_cancel: true, registrations: 4 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body });
        return answer(path, body);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventPaymentsPage } = await import("./components/event-payments-page");

beforeEach(() => {
  calls.length = 0;
  me = null;
  server = "new";
  answer = (path) => {
    if (path.endsWith("/refund")) return { refund: refundOf({ id: "rf-new" }), payment: payment({ refunded: 500, refundable: 0, status: "refunded" }) };
    if (path.endsWith("/retry")) return { refund: refundOf({ id: "rf-mia" }), payment: payment({ id: "pl-mia", guest_name: "Mia", status: "refunded", refundable: 0 }) };
    return {};
  };
  vi.restoreAllMocks();
});

const posts = () => calls.filter((c) => c.method === "POST");

async function openRefund(name: string) {
  render(<EventPaymentsPage eventId={37} />);
  fireEvent.click(await screen.findByRole("button", { name: `Refund ${name}` }));
  return screen.findByRole("dialog");
}

describe("the event's payments", () => {
  it("lists each payment with what was refunded, and offers a refund only where something is left", async () => {
    render(<EventPaymentsPage eventId={37} />);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Part refunded")).toBeInTheDocument();
    expect(within(table).getByText("Your Razorpay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund Asha Menon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund Ravi Das" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund Joe" })).not.toBeInTheDocument();
    expect(screen.getByText(/The payment is too old to refund/)).toBeInTheDocument();
  });

  it("refunds everything left, with the reason and one client_ref, and says the guest was told", async () => {
    const success = vi.spyOn(toast, "success");
    const dialog = await openRefund("Asha Menon");
    expect(dialog).toHaveTextContent("MyOtherApp's Razorpay");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Couldn't come" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund ₹/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const sent = posts()[0]!;
    expect(sent.path).toBe("/api/v1/events/37/payments/pl-asha/refund");
    expect(sent.body).toMatchObject({ reason: "Couldn't come" });
    expect(sent.body).not.toHaveProperty("amount");
    expect(String(sent.body?.client_ref)).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(success).toHaveBeenCalledWith(expect.stringMatching(/^Refunded ₹.*500.* to Asha Menon\. They've been told\.$/)));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("refunds a part, checked against what is left before it goes", async () => {
    const dialog = await openRefund("Ravi Das");
    expect(dialog).toHaveTextContent("your own Razorpay account");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Part of it/ }));
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "350" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Partial" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund/ }));
    expect(await within(dialog).findByText(/At most .*300.* is left to refund/)).toBeInTheDocument();
    expect(posts()).toEqual([]);
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "150.50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund/ }));
    await waitFor(() => expect(posts()[0]?.body).toMatchObject({ amount: 150.5, reason: "Partial" }));
  });

  it("asks for a reason first", async () => {
    const dialog = await openRefund("Asha Menon");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund ₹/ }));
    expect(await within(dialog).findByText(/Say why, in a few words/)).toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("keeps the dialog open with the server's reason when it refuses", async () => {
    answer = () => {
      throw new ApiError({ status: 422, message: "That is more than is left to refund on this payment.", errorCode: "AMOUNT_TOO_HIGH" });
    };
    const dialog = await openRefund("Asha Menon");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Couldn't come" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund ₹/ }));
    expect(await within(dialog).findByText("That is more than is left to refund on this payment.")).toBeInTheDocument();
  });

  it("says plainly when Razorpay did not take it, and it stays listed to try again", async () => {
    const error = vi.spyOn(toast, "error");
    answer = () => ({ refund: refundOf({ id: "rf-x", status: "failed", error: "Insufficient balance" }), payment: payment({ refunds: [refundOf({ id: "rf-x", status: "failed" })] }) });
    const dialog = await openRefund("Asha Menon");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Couldn't come" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Refund ₹/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("Razorpay didn't take the refund")));
    expect(error.mock.calls[0]![0]).toContain("Insufficient balance");
  });

  it("tries a failed refund again", async () => {
    render(<EventPaymentsPage eventId={37} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(posts().map((p) => p.path)).toEqual(["/api/v1/events/37/refunds/rf-mia/retry"]));
  });
});

describe("who sees payments", () => {
  it("is for owners and admins only", async () => {
    me = {
      role: "editor", role_label: "Editor", role_description: "", club_id: 5, club_name: "Circuit Society", member: null,
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true },
    };
    render(<EventPaymentsPage eventId={37} />);
    expect(await screen.findByText("Payments are for the club's owner and admins.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says it isn't there yet on a backend without club refunds", async () => {
    server = "old";
    render(<EventPaymentsPage eventId={37} />);
    expect(await screen.findByText(/Payments and refunds aren't available here yet/)).toBeInTheDocument();
  });
});
