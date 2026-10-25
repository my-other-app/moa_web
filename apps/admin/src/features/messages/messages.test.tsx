import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * A club's messages on its admin page, against GET /admin/messages/clubs/{id}
 * ({club_id, club_name, usage, history, own_limits, own_limits_apply}),
 * PUT/DELETE .../limits and POST /admin/messages/statements/{id}/retry; and
 * the plan editor's two message limits and two overage prices.
 */
let role: string | null = "owner";
let view: Record<string, unknown> = {};
/** What GET .../clubs/5 throws instead of answering, when set. */
let failure: Error | null = null;
const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
const posts: string[] = [];
const dels: string[] = [];

function channel(over: Record<string, unknown> = {}) {
  return { used: 0, limit: 1000, extra: 0, blocked: 0, rate_paise: 10, extra_paise: 0, percent: 0, state: "ok", kinds: {}, warned: [], ...over };
}

function usage(over: Record<string, unknown> = {}) {
  return {
    period: "2026-10",
    period_label: "October 2026",
    period_start: "2026-10-01T00:00:00+05:30",
    period_end: "2026-11-01T00:00:00+05:30",
    plan_key: "growth",
    plan_name: "Growth",
    billing: "razorpay",
    blocks_past_limit: false,
    custom: false,
    trial: null,
    channels: {
      email: channel({ used: 5250, limit: 5000, extra: 250, extra_paise: 2500, percent: 105, state: "over" }),
      whatsapp: channel({ used: 120, limit: 250, rate_paise: 100, percent: 48 }),
    },
    estimated_extra_paise: 2500,
    upgrade: null,
    ...over,
  };
}

function statement(over: Record<string, unknown> = {}) {
  return {
    id: 41,
    period: "2026-09",
    period_label: "September 2026",
    plan_key: "growth",
    billing: "razorpay",
    email: { used: 5400, limit: 5000, extra: 400, rate_paise: 10 },
    whatsapp: { used: 260, limit: 250, extra: 10, rate_paise: 100 },
    amount_paise: 5000,
    status: "charged",
    charged_at: "2026-10-01T01:10:00+05:30",
    razorpay_addon_id: "ao_1",
    ...over,
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/admin/messages/clubs/5") {
          if (failure) throw failure;
          return view;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: Record<string, unknown>) => {
        puts.push({ path, body });
        view = { ...view, own_limits: { ...body, updated_at: "2026-10-24T10:00:00+05:30" }, own_limits_apply: true };
        return view;
      }),
      post: vi.fn(async (path: string) => {
        posts.push(path);
        return statement({ id: 42, status: "charged", period_label: "August 2026" });
      }),
      del: vi.fn(async (path: string) => {
        dels.push(path);
        view = { ...view, own_limits: null, own_limits_apply: false };
        return view;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubMessagesPanel } = await import("./index");
const { ownLimitsProblems, toOwnLimitsForm, toOwnLimitsPayload, paiseText } = await import("./schemas");
const { planSchema, toForm, toPayload, LIMIT_FIELDS } = await import("@/features/subscriptions");

beforeEach(() => {
  role = "owner";
  failure = null;
  puts.length = 0;
  posts.length = 0;
  dels.length = 0;
  view = { club_id: 5, club_name: "Circuit", usage: usage(), history: [statement()], own_limits: null, own_limits_apply: false };
});

describe("a club's messages on its page", () => {
  it("shows the month against its limits, the extra and the closed months", async () => {
    render(<ClubMessagesPanel clubId={5} />);
    const panel = await screen.findByRole("region", { name: "Messages" });
    expect(await within(panel).findByText("October 2026")).toBeInTheDocument();
    expect(within(panel).getByText("5,250 / 5,000")).toBeInTheDocument();
    expect(within(panel).getByText("250 extra at ₹0.10 = ₹25")).toBeInTheDocument();
    expect(within(panel).getByRole("progressbar", { name: "Emails: 5250 of 5000" })).toBeInTheDocument();
    expect(within(panel).getByText(/Extra goes on the club's next Razorpay invoice/)).toBeInTheDocument();
    const months = within(panel).getByRole("table", { name: "Closed months" });
    expect(within(months).getByText("September 2026")).toBeInTheDocument();
    expect(within(months).getByText("₹50")).toBeInTheDocument();
    expect(within(months).getByText("On next invoice")).toBeInTheDocument();
    // Not Enterprise and nothing set: no own-limits form.
    expect(within(panel).queryByRole("group", { name: "Own message limits" })).toBeNull();
  });

  it("offers to try a refused charge again, to an admin who manages money only", async () => {
    view = { ...view, history: [statement({ id: 42, period_label: "August 2026", status: "gave_up", charged_at: null, razorpay_addon_id: null })] };
    render(<ClubMessagesPanel clubId={5} />);
    expect(await screen.findByText("Invoice by hand")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/messages/statements/42/retry"]));
  });

  it("never offers a retry to an admin without money, nor on a charged month", async () => {
    role = "support";
    view = { ...view, history: [statement({ status: "failed" }), statement({ id: 43, period_label: "July 2026" })] };
    render(<ClubMessagesPanel clubId={5} />);
    expect(await screen.findByText("Razorpay refused · retrying")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("sets an Enterprise club's own limits, empty for unlimited and the plan's price", async () => {
    view = { ...view, usage: usage({ plan_key: "enterprise", plan_name: "Enterprise", billing: "manual" }) };
    render(<ClubMessagesPanel clubId={5} />);
    const form = await screen.findByRole("group", { name: "Own message limits" });
    expect(within(form).getByText("Unlimited, at the plan's prices, until set")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Emails a month"), { target: { value: "50000" } });
    fireEvent.change(within(form).getByLabelText("Each extra WhatsApp (₹)"), { target: { value: "0.8" } });
    fireEvent.change(within(form).getByLabelText("Note"), { target: { value: "Fest deal" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      path: "/api/v1/admin/messages/clubs/5/limits",
      body: { emails_per_month: 50000, whatsapp_per_month: null, email_overage_paise: null, whatsapp_overage_paise: 80, note: "Fest deal" },
    });
    expect(await screen.findByText("In use")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the plan's" }));
    await waitFor(() => expect(dels).toEqual(["/api/v1/admin/messages/clubs/5/limits"]));
  });
});

/** What the API answers, as the gateway passes it on, made into the error the client throws. */
function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ahead of its backend", () => {
  it("leaves the section off the club's page while the API has no such route (FastAPI's bare 404)", async () => {
    failure = await answered(404, { detail: "Not Found" });
    const { container } = render(<ClubMessagesPanel clubId={5} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("region", { name: "Messages" })).toBeNull();
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it("still says it could not load on any other failure", async () => {
    failure = await answered(500, { message: "Internal Server Error", errors: { error: "x" }, error_code: null, track_id: "t" });
    render(<ClubMessagesPanel clubId={5} />);
    expect(await screen.findByText("Could not load the club's messages.")).toBeInTheDocument();
  });
});

describe("the own-limits form's rules", () => {
  it("takes whole numbers or nothing, and rupees to the paisa", () => {
    const blank = toOwnLimitsForm(null);
    expect(blank).toEqual({ emails: "", whatsapp: "", emailPrice: "", whatsappPrice: "", note: "" });
    expect(ownLimitsProblems(blank)).toEqual({});
    expect(ownLimitsProblems({ ...blank, emails: "12.5", emailPrice: "0.105" })).toEqual({
      emails: "A whole number, or empty for no limit",
      emailPrice: "Rupees, to the paisa (0.10), or empty for the plan's",
    });
    expect(toOwnLimitsPayload({ ...blank, whatsapp: "0", emailPrice: "0.15" })).toEqual({
      emails_per_month: null, whatsapp_per_month: 0, email_overage_paise: 15, whatsapp_overage_paise: null, note: null,
    });
    expect(toOwnLimitsForm({ emails_per_month: 0, whatsapp_per_month: null, email_overage_paise: 12, whatsapp_overage_paise: 100, note: "x" })).toEqual({
      emails: "0", whatsapp: "", emailPrice: "0.12", whatsappPrice: "1", note: "x",
    });
    expect([paiseText(10), paiseText(100), paiseText(234550)]).toEqual(["₹0.10", "₹1", "₹2,345.50"]);
  });
});

describe("the plan editor's message limits and prices", () => {
  it("lists both limits and carries the prices in rupees, paise on the wire", () => {
    expect(LIMIT_FIELDS.map((f) => f.key)).toEqual(expect.arrayContaining(["emails_per_month", "whatsapp_per_month"]));
    const plan = planSchema.parse({
      id: 3, key: "growth", name: "Growth", price_monthly_paise: 69900, price_yearly_paise: 699000,
      email_overage_paise: 10, whatsapp_overage_paise: 100, limits: { emails_per_month: 5000, whatsapp_per_month: 250 },
    });
    const form = toForm(plan);
    expect([form.email_overage_rupees, form.whatsapp_overage_rupees]).toEqual([0.1, 1]);
    const payload = toPayload({ ...form, email_overage_rupees: 0.15, whatsapp_overage_rupees: 1.2 });
    expect([payload.email_overage_paise, payload.whatsapp_overage_paise]).toEqual([15, 120]);
    expect(payload.limits).toMatchObject({ emails_per_month: 5000, whatsapp_per_month: 250 });
    // A plan from a server before the prices: the owner's defaults.
    const old = planSchema.parse({ id: 1, key: "free", name: "Free" });
    expect([old.email_overage_paise, old.whatsapp_overage_paise]).toEqual([10, 150]);
  });
});
