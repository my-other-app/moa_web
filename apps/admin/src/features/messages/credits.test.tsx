import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * Prepaid message credits in the admin app, against the backend's
 * feat/message-credits answers: GET /admin/messages/clubs/{id}/credits, POST
 * .../credits/grants, POST /admin/messages/credits/purchases/{id}/refund, and
 * GET/POST/PATCH /admin/messages/packs. Writes need `manage_money` (the
 * "owner" admin role here; "support" has none).
 */
let role: string | null = "owner";
let credits: unknown = {};
let packs: unknown = {};
const posts: Array<{ path: string; body: unknown }> = [];
const patches: Array<{ path: string; body: unknown }> = [];

const LOTS = [
  { id: 3, channel: "email", source: "purchase", quantity: 5000, remaining: 4200, bought_at: "2026-10-01T10:00:00Z", expires_at: "2027-10-01T10:00:00Z", status: "active", purchase_id: 7, reason: null, granted_by: null },
  { id: 4, channel: "whatsapp", source: "grant", quantity: 200, remaining: 0, bought_at: "2026-09-01T10:00:00Z", expires_at: "2027-03-01T10:00:00Z", status: "used", purchase_id: null, reason: "Goodwill for the outage", granted_by: { id: 1, name: "Asha" } },
  { id: 2, channel: "email", source: "purchase", quantity: 1000, remaining: 0, bought_at: "2025-09-01T10:00:00Z", expires_at: "2026-09-01T10:00:00Z", status: "expired", purchase_id: 2, reason: null, granted_by: null },
];
const PAID = {
  id: 7, receipt_number: "MOA-CR-000007", channel: "email", quantity: 5000, amount_paise: 44900, currency: "INR", status: "paid",
  created_at: "2026-10-01T09:59:00Z", paid_at: "2026-10-01T10:00:00Z", razorpay_order_id: "order_7", razorpay_payment_id: "pay_7", payment_method: "upi",
  refunded_paise: 0, refunded_at: null, credits_remaining: 4200, expires_at: "2027-10-01T10:00:00Z", refund_reason: null, refund_error: null, razorpay_refund_id: null,
};
const UNPAID = { ...PAID, id: 9, receipt_number: "MOA-CR-000009", status: "created", paid_at: null, razorpay_payment_id: null, credits_remaining: null };

function view(over: Record<string, unknown> = {}) {
  return {
    club_id: 5,
    club_name: "Circuit",
    channels: {
      email: { plan: { limit: 1000, used: 1000, remaining: 0 }, bought: { remaining: 4200, next_expiry: "2027-10-01T10:00:00Z", low: false }, total_remaining: 4200 },
      whatsapp: { plan: { limit: 250, used: 12, remaining: 238 }, bought: { remaining: 0, next_expiry: null, low: false }, total_remaining: 238 },
    },
    lots: LOTS,
    purchases: [PAID, UNPAID],
    ...over,
  };
}

const PACKS = [
  { id: 1, channel: "email", quantity: 1000, price_paise: 9900, active: true, sort_order: 10, updated_at: "2026-10-25T10:00:00Z", sold: 4 },
  { id: 6, channel: "whatsapp", quantity: 2000, price_paise: 259900, active: false, sort_order: 30, updated_at: "2026-10-25T10:00:00Z", sold: 0 },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/admin/messages/clubs/5/credits") {
          if (credits instanceof Error) throw credits;
          return credits;
        }
        if (path === "/api/v1/admin/messages/packs") {
          if (packs instanceof Error) throw packs;
          return packs;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        if (path === "/api/v1/admin/messages/clubs/5/credits/grants") return view();
        if (path === "/api/v1/admin/messages/credits/purchases/7/refund") return { ...PAID, status: "refunded", refunded_paise: 37716, credits_remaining: 0 };
        if (path === "/api/v1/admin/messages/packs") return { ...PACKS[0], id: 12, ...(body as object), sold: 0 };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        patches.push({ path, body });
        return { ...PACKS[0], ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubCreditsPanel, CreditPacksEditor } = await import("./index");
const { grantProblems, refundProblems, proRataPaise, packChanges, toPackForm, clubCreditsSchema } = await import("./credits");

function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  role = "owner";
  credits = view();
  packs = { prices_include_gst: true, validity_months: 12, packs: PACKS };
  posts.length = 0;
  patches.length = 0;
});

describe("the forms' rules", () => {
  it("wants a reason, whole credits and 1 to 36 months for a grant", () => {
    expect(grantProblems({ channel: "email", quantity: "500", validMonths: "12", reason: "Goodwill" })).toEqual({});
    expect(grantProblems({ channel: "email", quantity: "0", validMonths: "40", reason: " " })).toEqual({
      quantity: "A whole number from 1 to 10,00,000",
      validMonths: "1 to 36 months",
      reason: "Say why (it goes in the audit log)",
    });
  });

  it("refunds at most what is left, and the pro-rata share by default", () => {
    expect(proRataPaise(PAID)).toBe(37716);
    expect(refundProblems({ reason: "Asked", amount: "" }, PAID)).toEqual({});
    expect(refundProblems({ reason: "Asked", amount: "500" }, PAID)).toEqual({ amount: "At most ₹449" });
    expect(refundProblems({ reason: "Asked", amount: "0.105" }, PAID).amount).toMatch(/Rupees/);
  });

  it("sends only what changed on a pack", () => {
    const pack = { ...PACKS[0]!, channel: "email" as const };
    expect(packChanges(pack, { ...toPackForm(pack), price: "89" })).toEqual({ price_paise: 8900 });
    expect(packChanges(pack, toPackForm(pack))).toEqual({});
  });

  it("drops a lot it cannot read rather than the whole answer", () => {
    const parsed = clubCreditsSchema.parse(view({ lots: [...LOTS, { id: 99, channel: "sms" }] }));
    expect(parsed.lots.map((l) => l.id)).toEqual([3, 4, 2]);
  });
});

describe("a club's credits on its page", () => {
  it("shows its balance, every lot with its status and its purchases", async () => {
    render(<ClubCreditsPanel clubId={5} />);
    const panel = await screen.findByRole("region", { name: "Message credits" });
    const email = await within(panel).findByRole("group", { name: "Email balance" });
    expect(within(email).getByText(/Bought: 4,200 left/)).toBeInTheDocument();
    expect(within(email).getByText("Total left: 4,200")).toBeInTheDocument();
    const lots = within(panel).getByRole("table", { name: "Credit lots" });
    expect(within(lots).getByText("Granted by Asha")).toBeInTheDocument();
    expect(within(lots).getByText("Goodwill for the outage")).toBeInTheDocument();
    expect(within(lots).getByText("Used up")).toBeInTheDocument();
    expect(within(lots).getByText("Expired")).toBeInTheDocument();
    const bought = within(panel).getByRole("table", { name: "Credit purchases" });
    expect(within(bought).getByText("MOA-CR-000007")).toBeInTheDocument();
    expect(within(bought).getByText("Not paid")).toBeInTheDocument();
    // Only a paid purchase can be refunded.
    expect(within(bought).getAllByRole("button", { name: /Refund/ })).toHaveLength(1);
  });

  it("grants free credits with a reason", async () => {
    render(<ClubCreditsPanel clubId={5} />);
    const form = await screen.findByRole("group", { name: "Grant free credits" });
    fireEvent.click(within(form).getByRole("button", { name: "Grant credits" }));
    expect(await within(form).findByText("Say why (it goes in the audit log)")).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText("Channel"), { target: { value: "whatsapp" } });
    fireEvent.change(within(form).getByLabelText("Credits"), { target: { value: "200" } });
    fireEvent.change(within(form).getByLabelText("Valid for (months)"), { target: { value: "6" } });
    fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "Festival sponsor" } });
    fireEvent.click(within(form).getByRole("button", { name: "Grant credits" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      path: "/api/v1/admin/messages/clubs/5/credits/grants",
      body: { channel: "whatsapp", quantity: 200, valid_months: 6, reason: "Festival sponsor" },
    });
  });

  it("refunds a purchase: the pro-rata amount when left empty, a reason always", async () => {
    render(<ClubCreditsPanel clubId={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refund MOA-CR-000007" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/All of its unused credits \(4,200 of 5,000\) are removed at once/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Amount (₹)")).toHaveAttribute("placeholder", "Pro-rata of the unused: ₹377.16");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Club closed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refund" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/v1/admin/messages/credits/purchases/7/refund", body: { reason: "Club closed", amount_paise: null } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends an amount an admin types, in paise", async () => {
    render(<ClubCreditsPanel clubId={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refund MOA-CR-000007" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "40" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Partial" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refund" }));
    await waitFor(() => expect(posts[0]?.body).toEqual({ reason: "Partial", amount_paise: 4000 }));
  });

  it("offers neither grants nor refunds to an admin without money", async () => {
    role = "support";
    render(<ClubCreditsPanel clubId={5} />);
    expect(await screen.findByText("Only admins who manage money can grant credits or refund a purchase.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Grant free credits" })).toBeNull();
  });

  it("is left off the club's page while the API has no such route", async () => {
    credits = await answered(404, { detail: "Not Found" });
    const { container } = render(<ClubCreditsPanel clubId={5} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("the packs editor", () => {
  it("lists every pack, off sale too, and saves only what changed", async () => {
    render(<CreditPacksEditor />);
    const table = await screen.findByRole("table", { name: "Packs" });
    expect(within(table).getByLabelText("WhatsApp pack 6: on sale")).not.toBeChecked();
    expect(screen.getByText(/Prices include GST, as plan prices do/)).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: "Email pack 1" });
    const save = within(row).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(within(row).getByLabelText("Email pack 1: price"), { target: { value: "89" } });
    expect(within(row).getByText("₹0.09")).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(patches).toEqual([{ path: "/api/v1/admin/messages/packs/1", body: { price_paise: 8900 } }]));
  });

  it("adds a pack", async () => {
    render(<CreditPacksEditor />);
    const form = await screen.findByRole("group", { name: "Add a pack" });
    fireEvent.change(within(form).getByLabelText("Channel"), { target: { value: "whatsapp" } });
    fireEvent.change(within(form).getByLabelText("Messages"), { target: { value: "5000" } });
    fireEvent.change(within(form).getByLabelText("Price (₹)"), { target: { value: "5999" } });
    fireEvent.change(within(form).getByLabelText("Order"), { target: { value: "40" } });
    fireEvent.click(within(form).getByRole("button", { name: /Add pack/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/v1/admin/messages/packs", body: { channel: "whatsapp", quantity: 5000, price_paise: 599900, active: true, sort_order: 40 } });
  });

  it("is read-only for an admin without money", async () => {
    role = "support";
    render(<CreditPacksEditor />);
    const table = await screen.findByRole("table", { name: "Packs" });
    expect(within(table).getByLabelText("Email pack 1: price")).toBeDisabled();
    expect(within(table).queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Add a pack" })).toBeNull();
  });

  it("is not there while the API has no such route", async () => {
    packs = await answered(404, { detail: "Not Found" });
    const { container } = render(<CreditPacksEditor />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
