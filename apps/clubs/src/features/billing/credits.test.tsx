import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";
import { formatDate } from "@moa/app-kit";

/**
 * Message credits on Billing (#credits), against the backend's
 * feat/message-credits answers: GET /clubs/messages/credits, POST
 * /clubs/messages/credits/orders and /verify, GET .../purchases/{id}/receipt.
 * Razorpay's checkout is a stand-in on window (order mode): nothing here
 * loads its script or reaches a payment.
 */

const OWNER = { role: "owner", role_label: "Owner", role_description: "Everything.", can: { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true }, club_id: 5, club_name: "LetMeGoo", member: null };
const EDITOR = { ...OWNER, role: "editor", role_label: "Editor", can: { ...OWNER.can, manage_access: false, see_access: false, money: false } };

const LOT = { id: 3, source: "purchase", quantity: 5000, remaining: 4200, bought_at: "2026-10-01T10:00:00Z", expires_at: "2027-10-01T10:00:00Z", purchase_id: 7, reason: null };
const GRANT = { id: 4, source: "grant", quantity: 500, remaining: 500, bought_at: "2026-10-05T10:00:00Z", expires_at: "2027-04-05T10:00:00Z", purchase_id: null, reason: null };
const PURCHASE = {
  id: 7, receipt_number: "MOA-CR-000007", channel: "email", quantity: 5000, amount_paise: 44900, currency: "INR", status: "paid",
  created_at: "2026-10-01T09:59:00Z", paid_at: "2026-10-01T10:00:00Z", razorpay_order_id: "order_7", razorpay_payment_id: "pay_7", payment_method: "upi",
  refunded_paise: 0, refunded_at: null, credits_remaining: 4200, expires_at: "2027-10-01T10:00:00Z",
};
const PACKS = [
  { id: 1, channel: "email", quantity: 1000, price_paise: 9900, sort_order: 10 },
  { id: 2, channel: "email", quantity: 5000, price_paise: 44900, sort_order: 20 },
  { id: 4, channel: "whatsapp", quantity: 100, price_paise: 15000, sort_order: 10 },
];

function credits(over: Record<string, unknown> = {}) {
  return {
    period: "2026-10",
    period_label: "October 2026",
    prices_include_gst: true,
    validity_months: 12,
    can_buy: true,
    channels: {
      email: { plan: { limit: 1000, used: 950, remaining: 50 }, bought: { remaining: 4700, next_expiry: GRANT.expires_at, low: false }, total_remaining: 4750, lots: [GRANT, LOT] },
      whatsapp: { plan: { limit: 250, used: 250, remaining: 0 }, bought: { remaining: 5, next_expiry: null, low: true }, total_remaining: 5, lots: [] },
    },
    packs: PACKS,
    purchases: [PURCHASE],
    ...over,
  };
}

const RECEIPT = {
  receipt_number: "MOA-CR-000007", issued_at: "2026-10-01T10:00:00Z", status: "paid",
  seller: { name: "MyOtherApp", website: "https://myotherapp.in", email: "support@myotherapp.in" },
  club: { id: 5, name: "LetMeGoo", email: "owner@letmegoo.in" },
  item: "5,000 email credits, valid 12 months", channel: "email", quantity: 5000, amount_paise: 44900, currency: "INR", prices_include_gst: true,
  razorpay_payment_id: "pay_7", payment_method: "upi", refunded_paise: 0, refunded_at: null, expires_at: "2027-10-01T10:00:00Z",
};

const ORDER = {
  purchase_id: 8, razorpay_order_id: "order_8", amount_paise: 9900, currency: "INR", key_id: "rzp_test_server", name: "MyOtherApp",
  description: "1,000 email credits", receipt_number: "MOA-CR-000008", prefill: { email: "owner@letmegoo.in", contact: null, name: "LetMeGoo" },
};
const PAID_8 = { ...PURCHASE, id: 8, receipt_number: "MOA-CR-000008", quantity: 1000, amount_paise: 9900, razorpay_order_id: "order_8", razorpay_payment_id: "pay_8" };

type State = { me: unknown; credits: unknown; order: () => unknown; verify: () => unknown };
const state = {} as State;
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") return state.me;
        if (path === "/api/v1/clubs/messages/credits") {
          if (state.credits instanceof Error) throw state.credits;
          return typeof state.credits === "function" ? (state.credits as () => unknown)() : state.credits;
        }
        if (path === "/api/v1/clubs/messages/credits/purchases/7/receipt") return RECEIPT;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/messages/credits/orders") return state.order();
        if (path === "/api/v1/clubs/messages/credits/verify") return state.verify();
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { CreditsSection, creditsSchema, perMessageText, purchaseStatusText, messagesText, creditErrorText, receiptRows } = await import("./index");

let opened: Array<Record<string, unknown>> = [];
let razorpayDoes: "pay" | "dismiss" = "pay";

beforeEach(() => {
  calls.length = 0;
  opened = [];
  razorpayDoes = "pay";
  Object.assign(state, { me: OWNER, credits: credits(), order: () => ORDER, verify: () => PAID_8 });
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_build_key");
  window.Razorpay = vi.fn(function (this: unknown, options: Record<string, unknown>) {
    opened.push(options);
    return {
      open: () => {
        if (razorpayDoes === "pay") (options.handler as (r: unknown) => void)({ razorpay_payment_id: "pay_8", razorpay_order_id: options.order_id, razorpay_signature: "sig_8" });
        else (options.modal as { ondismiss: () => void }).ondismiss();
      },
    };
  }) as unknown as typeof window.Razorpay;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.Razorpay;
});

const posts = () => calls.filter((c) => c.method === "POST");

describe("the shapes and the words", () => {
  it("parses the answer, dropping a pack it cannot read rather than all of them", () => {
    const c = creditsSchema.parse(credits({ packs: [...PACKS, { id: 9, channel: "sms", quantity: 10, price_paise: 100 }] }));
    expect(c.packs.map((p) => p.id)).toEqual([1, 2, 4]);
    expect(c.channels.email.lots.map((l) => l.source)).toEqual(["grant", "purchase"]);
    expect(c.purchases[0]?.status).toBe("paid");
    // Fields a server leaves out are read as nothing, not as a failure.
    const bare = creditsSchema.parse({ channels: { email: {}, whatsapp: {} } });
    expect(bare.can_buy).toBe(false);
    expect(bare.channels.email.plan).toEqual({ limit: null, used: 0, remaining: null });
    expect(bare.validity_months).toBe(12);
  });

  it("prices each message to the paisa, and says what became of a purchase", () => {
    expect(perMessageText({ quantity: 100, price_paise: 15000 })).toBe("₹1.50 each");
    expect(perMessageText({ quantity: 1000, price_paise: 9900 })).toBe("≈ ₹0.10 each");
    expect(perMessageText({ quantity: 20000, price_paise: 159900 })).toBe("≈ ₹0.08 each");
    expect(messagesText("whatsapp", 1)).toBe("1 WhatsApp message");
    expect(purchaseStatusText({ status: "refunded", refunded_paise: 4000, amount_paise: 44900 })).toBe("Partly refunded (₹40)");
    expect(purchaseStatusText({ status: "refunded", refunded_paise: 44900, amount_paise: 44900 })).toBe("Refunded");
    expect(purchaseStatusText({ status: "refund_failed", refunded_paise: 0, amount_paise: 1 })).toBe("Refund in progress");
    expect(creditErrorText(new ApiError({ status: 404, message: "x", errorCode: "PACK_NOT_FOUND" }))).toMatch(/isn't on sale any more/);
    expect(creditErrorText(new ApiError({ status: 403, message: "Forbidden" }))).toBe("Only the club's own account can buy credits.");
  });
});

describe("ahead of its backend", () => {
  it("is left out entirely while the API has no such route", async () => {
    state.credits = await answered(404, { detail: "Not Found" });
    const { container } = render(<CreditsSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it("says it could not load on any other failure", async () => {
    state.credits = await answered(500, { message: "Internal Server Error", errors: {}, error_code: null, track_id: "t" });
    render(<CreditsSection />);
    expect(await screen.findByText("Could not load your credits. Try reloading the page.")).toBeInTheDocument();
  });
});

describe("the club's credits", () => {
  it("shows the plan's month, the bought lots with their expiry, the packs and the purchases", async () => {
    render(<CreditsSection />);
    const email = await screen.findByRole("region", { name: "Email credits" });
    expect(within(email).getByText("950 of 1,000 used · 50 left")).toBeInTheDocument();
    expect(within(email).getByText("4,750 left in all")).toBeInTheDocument();
    const lots = within(email).getByRole("list", { name: "Email credit lots" });
    expect(within(lots).getByText(/4,200 of 5,000 left/)).toBeInTheDocument();
    expect(within(lots).getByText(`Expires ${formatDate(LOT.expires_at)}`)).toBeInTheDocument();
    expect(within(lots).getByText("Free credits from MyOtherApp")).toBeInTheDocument();
    expect(within(email).getByRole("button", { name: "Buy 1,000 emails for ₹99" })).toBeInTheDocument();
    expect(within(email).getByText("≈ ₹0.09 each")).toBeInTheDocument();

    const whatsapp = screen.getByRole("region", { name: "WhatsApp credits" });
    expect(within(whatsapp).getByText("Running low: less than a tenth of your last pack is left.")).toBeInTheDocument();
    expect(within(whatsapp).getByText("None bought yet.")).toBeInTheDocument();
    expect(within(whatsapp).getByRole("button", { name: "Buy 100 WhatsApp messages for ₹150" })).toBeInTheDocument();

    expect(screen.getByText(/Prices include GST\. Credits last 12 months from purchase/)).toBeInTheDocument();
    const bought = screen.getByRole("list", { name: "Purchases" });
    expect(within(bought).getByText("5,000 emails")).toBeInTheDocument();
    expect(within(bought).getByText("₹449")).toBeInTheDocument();
    expect(within(bought).getByText("Paid")).toBeInTheDocument();
    expect(document.getElementById("credits")).not.toBeNull();
  });

  it("is read-only for a team member: prices, but nothing to buy", async () => {
    state.me = EDITOR;
    render(<CreditsSection />);
    const email = await screen.findByRole("region", { name: "Email credits" });
    expect(within(email).queryByRole("button", { name: /^Buy / })).toBeNull();
    expect(within(email).getByText("₹99")).toBeInTheDocument();
    expect(await screen.findByText(/Only the club's own account can buy credits\./)).toBeInTheDocument();
  });

  it("offers nothing to buy while payments can't be taken", async () => {
    state.credits = credits({ can_buy: false });
    render(<CreditsSection />);
    const email = await screen.findByRole("region", { name: "Email credits" });
    expect(within(email).queryByRole("button", { name: /^Buy / })).toBeNull();
    expect(within(email).getByText("Buying credits isn't available right now. Try again later.")).toBeInTheDocument();
  });
});

describe("buying a pack", () => {
  it("makes an order, opens Razorpay on it, verifies the payment and says the credits are in", async () => {
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Buy 1,000 emails for ₹99" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    // The server's key wins over the build's.
    expect(opened[0]).toMatchObject({ key: "rzp_test_server", order_id: "order_8", amount: 9900, currency: "INR", name: "MyOtherApp", description: "1,000 email credits" });
    expect(opened[0]?.subscription_id).toBeUndefined();
    expect(await screen.findByText("Payment received: 1,000 emails added to your credits. Receipt MOA-CR-000008.")).toBeInTheDocument();
    expect(posts()).toEqual([
      { method: "POST", path: "/api/v1/clubs/messages/credits/orders", body: { pack_id: 1 } },
      { method: "POST", path: "/api/v1/clubs/messages/credits/verify", body: { razorpay_order_id: "order_8", razorpay_payment_id: "pay_8", razorpay_signature: "sig_8" } },
    ]);
  });

  it("waits for Razorpay when the payment is not captured yet, and says so once the server has it", async () => {
    let paid = false;
    state.verify = () => ({ ...PAID_8, status: "created", paid_at: null });
    state.credits = () => credits({ purchases: paid ? [PAID_8, PURCHASE] : [PURCHASE] });
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Buy 1,000 emails for ₹99" }));
    expect(await screen.findByText(/Razorpay is confirming it/)).toBeInTheDocument();
    paid = true;
    // The verify's settling reads the credits again; the purchase is paid by then.
    expect(await screen.findByText("Payment confirmed: 1,000 emails added to your credits. Receipt MOA-CR-000008.", {}, { timeout: 7000 })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  }, 10_000);

  it("falls back to the build's key when the server sends none", async () => {
    state.order = () => ({ ...ORDER, key_id: null });
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Buy 100 WhatsApp messages for ₹150" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]?.key).toBe("rzp_test_build_key");
  });

  it("says nothing was charged when checkout is closed, and verifies nothing", async () => {
    razorpayDoes = "dismiss";
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Buy 5,000 emails for ₹449" }));
    expect(await screen.findByText("Checkout was closed before paying, so nothing was charged.")).toBeInTheDocument();
    expect(posts().map((p) => p.path)).toEqual(["/api/v1/clubs/messages/credits/orders"]);
  });

  it("says why an order was refused, and opens nothing", async () => {
    state.order = () => {
      throw new ApiError({ status: 404, message: "Pack not found", errorCode: "PACK_NOT_FOUND" });
    };
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Buy 1,000 emails for ₹99" }));
    expect(await screen.findByText("That pack isn't on sale any more. Pick another one.")).toBeInTheDocument();
    expect(opened).toHaveLength(0);
  });
});

describe("receipts", () => {
  it("shows a purchase's receipt and prints it on a page of its own", async () => {
    const page = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(page as unknown as Window);
    render(<CreditsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Receipt MOA-CR-000007" }));
    const dialog = await screen.findByRole("dialog");
    const details = await within(dialog).findByLabelText("Receipt details");
    expect(within(details).getByText("5,000 email credits, valid 12 months")).toBeInTheDocument();
    expect(within(details).getByText("₹449 (includes GST)")).toBeInTheDocument();
    expect(within(details).getByText("LetMeGoo · owner@letmegoo.in")).toBeInTheDocument();
    expect(within(details).getByText("UPI · pay_7")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Print" }));
    expect(open).toHaveBeenCalled();
    expect(page.print).toHaveBeenCalled();
    expect(String(page.document.write.mock.calls[0]?.[0])).toContain("MOA-CR-000007");
    open.mockRestore();
  });

  it("escapes nothing it should not and leaves out what is empty", () => {
    const rows = receiptRows({ ...RECEIPT, razorpay_payment_id: null, payment_method: null, expires_at: null, refunded_paise: 4000, refunded_at: "2026-10-10T10:00:00Z" } as never);
    expect(rows.map(([k]) => k)).toEqual(["Receipt", "Date", "From", "Billed to", "Item", "Amount", "Refunded"]);
  });
});
