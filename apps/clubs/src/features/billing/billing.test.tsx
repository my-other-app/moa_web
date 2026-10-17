import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import plans from "../__fixtures__/plans.json";
import clubInfo from "../__fixtures__/club-info.json";

/**
 * Plan & billing against the endpoints as the backend answers them:
 * GET /clubs/subscription (null, or SubscriptionOut), GET /clubs/entitlements,
 * GET /plans, and POST /clubs/subscription/start. Razorpay's checkout is a
 * stand-in on window: nothing here loads its script or reaches a payment.
 */

const OWNER = { role: "owner", role_label: "Owner", role_description: "Everything.", can: { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true }, club_id: 5, club_name: "LetMeGoo", member: null };
const EDITOR = {
  ...OWNER,
  role: "editor",
  role_label: "Editor",
  can: { ...OWNER.can, manage_access: false, see_access: false, money: false, club_profile: false, delete_events: false },
  member: { id: 9, email: "ed@example.com", full_name: "Ed", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null },
};

const growth = plans.plans[2]!;
const GROWTH_ACTIVE = {
  id: 11,
  club: { id: 5, name: "LetMeGoo" },
  plan: { ...growth, visibility: "public", sort_order: 3, billable: true, subscriber_count: 4, features: {}, feature_groups: {} },
  cycle: "yearly",
  status: "active",
  current_period_end: "2027-01-15T10:00:00+05:30",
  mrr_paise: 83250,
  last_failure_reason: null,
  razorpay_subscription_id: "sub_live_growth",
};

const FREE_ENTITLEMENTS = {
  plan_key: "free",
  plan_name: "Free",
  status: null,
  cycle: null,
  current_period_end: null,
  limits: plans.plans[0]!.limits,
  features: { tickets: true, checkin: true },
  configured: true,
};

type State = {
  me: unknown;
  club: Record<string, unknown>;
  sub: unknown;
  ent: Record<string, unknown>;
  plans: unknown;
  start: () => unknown;
};

const state: State = { me: OWNER, club: clubInfo, sub: null, ent: FREE_ENTITLEMENTS, plans, start: () => ({}) };
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") return state.me;
        if (path === "/api/v1/clubs/info") return state.club;
        if (path === "/api/v1/clubs/subscription") return state.sub;
        if (path === "/api/v1/clubs/entitlements") return state.ent;
        if (path === "/api/v1/plans") {
          if (state.plans instanceof Error) throw state.plans;
          return state.plans;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/subscription/start") return state.start();
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { BillingPage } = await import("./components/billing-page");
const { entitlementsSchema, catalogSchema, subscriptionSchema, priceLine, awaitingCheckout, billedByRazorpay } = await import("./schemas");

/** Razorpay's constructor as checkout.js defines it, recording what it was opened with. */
let opened: Array<Record<string, unknown>> = [];
let razorpayDoes: "authorise" | "dismiss" = "authorise";

beforeEach(() => {
  calls.length = 0;
  opened = [];
  razorpayDoes = "authorise";
  Object.assign(state, { me: OWNER, club: clubInfo, sub: null, ent: FREE_ENTITLEMENTS, plans, start: () => ({ razorpay_subscription_id: "sub_test_123", checkout_url: "https://rzp.io/i/abc", status: "created" }) });
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_not_a_real_key");
  window.Razorpay = vi.fn(function (this: unknown, options: Record<string, unknown>) {
    opened.push(options);
    return {
      open: () => {
        if (razorpayDoes === "authorise") (options.handler as (r: unknown) => void)({ razorpay_payment_id: "pay_1", razorpay_subscription_id: options.subscription_id });
        else (options.modal as { ondismiss: () => void }).ondismiss();
      },
    };
  }) as unknown as typeof window.Razorpay;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.Razorpay;
});

const card = (name: string) => screen.getByRole("article", { name });
const posts = () => calls.filter((c) => c.method === "POST");

describe("the shapes", () => {
  it("parses the catalogue, a subscription and entitlements without usage", () => {
    expect(catalogSchema.parse(plans).plans.map((p) => p.key)).toEqual(["free", "starter", "growth", "pro", "campus", "enterprise"]);
    expect(subscriptionSchema.parse(GROWTH_ACTIVE).status).toBe("active");
    expect(entitlementsSchema.parse(FREE_ENTITLEMENTS).usage).toBeNull();
  });

  it("prices a month, and a year as its monthly share", () => {
    const g = catalogSchema.parse(plans).plans[2]!;
    expect(priceLine(g, "monthly")).toEqual({ amount: "₹999", per: "/ month", note: "Billed monthly" });
    expect(priceLine(g, "yearly")).toEqual({ amount: "₹833", per: "/ month", note: "₹9,990 billed yearly" });
  });

  it("knows a subscription Razorpay bills from one still waiting for checkout", () => {
    const live = subscriptionSchema.parse(GROWTH_ACTIVE);
    expect(billedByRazorpay(live)).toBe(true);
    expect(awaitingCheckout(live)).toBe(false);
    const waiting = subscriptionSchema.parse({ ...GROWTH_ACTIVE, status: "trial", current_period_end: null, mrr_paise: 0 });
    expect(awaitingCheckout(waiting)).toBe(true);
    expect(billedByRazorpay({ ...live, status: "cancelled" })).toBe(false);
    expect(billedByRazorpay({ ...live, razorpay_subscription_id: null })).toBe(false);
  });
});

describe("plan & billing", () => {
  it("shows the current plan with its status, cycle and renewal", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = { ...FREE_ENTITLEMENTS, plan_key: "growth", plan_name: "Growth", status: "active", cycle: "yearly", limits: growth.limits };
    render(<BillingPage />);
    const current = await screen.findByRole("region", { name: "Current plan" });
    expect(within(current).getByText("Growth")).toBeInTheDocument();
    expect(within(current).getByText("Active")).toBeInTheDocument();
    expect(within(current).getByText("₹9,990 billed yearly")).toBeInTheDocument();
    expect(within(current).getByText("Yearly")).toBeInTheDocument();
    expect(within(current).getByText("Renews 15 Jan 2027")).toBeInTheDocument();
    // The toggle starts on the cycle the club pays, and the card says which plan it is on.
    expect(await screen.findByRole("radio", { name: /Yearly/ })).toHaveAttribute("aria-checked", "true");
    expect(within(card("Growth")).getByText("Current plan")).toBeInTheDocument();
  });

  it("draws usage against each limit, Unlimited where there is none and Not included at zero", async () => {
    state.ent = {
      ...FREE_ENTITLEMENTS,
      limits: { ...FREE_ENTITLEMENTS.limits, registrations_per_month: null },
      usage: { events_per_month: 2, registrations_per_month: 120, committee_seats: 1, merch_items_per_event: 0 },
    };
    render(<BillingPage />);
    const usage = await screen.findByRole("region", { name: "Usage" });
    const events = within(usage).getByRole("progressbar", { name: "Events: 2 of 2 this month" });
    expect(events).toHaveAttribute("aria-valuenow", "2");
    expect(events).toHaveAttribute("aria-valuemax", "2");
    expect(within(usage).getByText("2 of 2")).toHaveClass("text-refuse");
    expect(within(usage).getByText("120 · Unlimited")).toBeInTheDocument();
    // Free allows no coupons and no merchandise.
    expect(within(usage).getAllByText("Not included")).toHaveLength(2);
    expect(within(usage).getByRole("progressbar", { name: "Committee seats: 1 of 1 logins with roles" })).toBeInTheDocument();
  });

  it("shows the caps without bars when the server sends no usage", async () => {
    state.ent = { ...FREE_ENTITLEMENTS, limits: { ...FREE_ENTITLEMENTS.limits, announcements_per_month: null } };
    render(<BillingPage />);
    const usage = await screen.findByRole("region", { name: "Usage" });
    expect(within(usage).getByText("Up to 2")).toBeInTheDocument();
    expect(within(usage).getByText("Up to 1 GB")).toBeInTheDocument();
    expect(within(usage).getByText("Unlimited")).toBeInTheDocument();
    expect(within(usage).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("switches every price between monthly and yearly", async () => {
    render(<BillingPage />);
    const g = await screen.findByRole("article", { name: "Growth" });
    expect(within(g).getByText("₹999")).toBeInTheDocument();
    expect(within(g).getByText("Billed monthly")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Yearly · 2 months free" }));
    expect(within(g).getByText("₹833")).toBeInTheDocument();
    expect(within(g).getByText("₹9,990 billed yearly")).toBeInTheDocument();
    expect(within(card("Enterprise")).getByText("Custom")).toBeInTheDocument();
    expect(within(card("Free")).getByText("Current plan")).toBeInTheDocument();
  });

  it("offers the plan picked at sign-up first, on the cycle picked", async () => {
    state.club = { ...clubInfo, requested_plan: "growth", requested_cycle: "yearly" };
    render(<BillingPage />);
    await waitFor(() => expect(within(card("Growth")).getByText("Picked at sign-up")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /Yearly/ })).toHaveAttribute("aria-checked", "true");
    expect(within(card("Pro")).queryByText("Picked at sign-up")).not.toBeInTheDocument();
  });

  it("starts the subscription and opens Razorpay's checkout with its id", async () => {
    render(<BillingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: /Yearly/ }));
    fireEvent.click(within(card("Growth")).getByRole("button", { name: "Start 14-day trial — Growth" }));

    await waitFor(() => expect(opened).toHaveLength(1));
    expect(posts()).toEqual([{ method: "POST", path: "/api/v1/clubs/subscription/start", body: { plan_id: 3, plan_key: "growth", cycle: "yearly" } }]);
    expect(opened[0]).toMatchObject({ key: "rzp_test_not_a_real_key", subscription_id: "sub_test_123", name: "MyOtherApp", description: "Growth · yearly" });
    expect(await screen.findByText(/Razorpay is confirming it now/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Razorpay to confirm");
  });

  it("says nothing was charged when checkout is closed", async () => {
    razorpayDoes = "dismiss";
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Starter" })).findByRole("button", { name: "Upgrade to Starter — Starter" }));
    expect(await screen.findByText(/closed before it finished, so nothing was charged/)).toBeInTheDocument();
    expect(posts()[0]?.body).toEqual({ plan_id: 2, plan_key: "starter", cycle: "monthly" });
  });

  it("hands over Razorpay's own checkout page when this build has no key", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "");
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Pro" })).findByRole("button", { name: /Start 14-day trial/ }));
    expect(await screen.findByRole("link", { name: "Open checkout" })).toHaveAttribute("href", "https://rzp.io/i/abc");
    expect(opened).toHaveLength(0);
  });

  it("says a plan Razorpay cannot sell yet is a matter for support", async () => {
    state.start = () => {
      throw new ApiError({ status: 500, message: "Internal Server Error" });
    };
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Campus" })).findByRole("button", { name: /Upgrade to Campus/ }));
    expect(await screen.findByText(/can't be bought online yet\. Write to support@myotherapp\.in/)).toBeInTheDocument();
    expect(opened).toHaveLength(0);
  });

  it("sends Enterprise to a conversation, and never starts a second Razorpay subscription", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = { ...FREE_ENTITLEMENTS, plan_key: "growth", plan_name: "Growth", limits: growth.limits };
    render(<BillingPage />);
    const enterprise = await screen.findByRole("article", { name: "Enterprise" });
    expect(within(enterprise).getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", expect.stringMatching(/^mailto:support@myotherapp\.in\?subject=Enterprise%20plan/));
    // Already billed by Razorpay: moving to Pro is done by people, not a second subscription.
    expect(within(card("Pro")).getByRole("link", { name: "Talk to us to switch" })).toHaveAttribute("href", expect.stringContaining("mailto:"));
    expect(within(card("Free")).getByRole("link", { name: "Talk to us to downgrade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade|Start|Switch/ })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("reopens the same Razorpay subscription for a checkout left unfinished", async () => {
    state.sub = { ...GROWTH_ACTIVE, status: "past_due", current_period_end: null, mrr_paise: 0, razorpay_subscription_id: "sub_waiting" };
    render(<BillingPage />);
    expect(await screen.findByText("Growth is waiting for you to authorise it in Razorpay.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish checkout" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toMatchObject({ subscription_id: "sub_waiting" });
    expect(posts()).toHaveLength(0);
  });

  it("does not claim a trial is unpaid: the server is not told when one is authorised", async () => {
    state.sub = { ...GROWTH_ACTIVE, status: "trial", current_period_end: null, mrr_paise: 0, razorpay_subscription_id: "sub_trial" };
    render(<BillingPage />);
    expect(await screen.findByText(/If you haven't authorised Growth in Razorpay yet, do it before the trial ends/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open checkout" })).toBeInTheDocument();
    expect(within(await screen.findByRole("article", { name: "Growth" })).getByText("You're on this plan.")).toBeInTheDocument();
  });

  it("is read-only for a team member: the plan shows, nothing can be changed", async () => {
    state.me = EDITOR;
    state.club = { ...clubInfo, requested_plan: "growth", requested_cycle: "monthly" };
    render(<BillingPage />);
    expect(await screen.findByText(/Only the club's own account can change the plan/)).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Growth" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade|Start|Switch|Finish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Talk to us/ })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("keeps the plan and usage when the catalogue is not there yet", async () => {
    state.plans = new ApiError({ status: 404, message: "Not Found" });
    render(<BillingPage />);
    expect(await screen.findByText("Plans are not available right now")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Current plan" })).toHaveTextContent("Free");
  });
});
