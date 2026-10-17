import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { formatDateTime } from "@moa/app-kit";

import plans from "../__fixtures__/plans.json";
import clubInfo from "../__fixtures__/club-info.json";

/**
 * Plan & billing against the endpoints as the backend (feat/club-plans)
 * answers them: GET /plans, GET /clubs/subscription (null, or SubscriptionOut
 * with entitled / cancel_at_period_end / trial_ends_at / checkout_expires_at),
 * GET /clubs/entitlements (with usage and requested_plan), and POST
 * /clubs/subscription/start and /cancel. Razorpay's checkout is a stand-in on
 * window: nothing here loads its script or reaches a payment.
 */

const OWNER = { role: "owner", role_label: "Owner", role_description: "Everything.", can: { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true }, club_id: 5, club_name: "LetMeGoo", member: null };
const EDITOR = {
  ...OWNER,
  role: "editor",
  role_label: "Editor",
  can: { ...OWNER.can, manage_access: false, see_access: false, money: false, club_profile: false, delete_events: false },
  member: { id: 9, email: "ed@example.com", full_name: "Ed", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null },
};

const free = plans.plans[0]!;
const growth = plans.plans[2]!;
const GROWTH_PLAN_OUT = { ...growth, visibility: "public", sort_order: 3, billable: true, subscriber_count: 4, features: {}, feature_groups: {} };

/** SubscriptionOut for a club paying for Growth yearly. */
const GROWTH_ACTIVE = {
  id: 11,
  club: { id: 5, name: "LetMeGoo" },
  plan: GROWTH_PLAN_OUT,
  cycle: "yearly",
  status: "active",
  current_period_end: "2027-01-15T10:00:00+05:30",
  mrr_paise: 83250,
  last_failure_reason: null,
  razorpay_subscription_id: "sub_live_growth",
  entitled: true,
  cancel_at_period_end: false,
  cancel_requested_at: null,
  trial_ends_at: null,
  pending_since: null,
  checkout_expires_at: null,
};

/** A checkout opened for Growth monthly, not paid: grants nothing. */
const GROWTH_PENDING = {
  ...GROWTH_ACTIVE,
  cycle: "monthly",
  status: "pending",
  current_period_end: null,
  mrr_paise: 0,
  razorpay_subscription_id: "sub_waiting",
  entitled: false,
  pending_since: "2026-10-17T09:00:00+05:30",
  checkout_expires_at: "2026-10-18T09:00:00+05:30",
};

const FREE_ENTITLEMENTS = {
  plan_key: "free",
  plan_name: "Free",
  status: null,
  cycle: null,
  current_period_end: null,
  limits: free.limits,
  features: { tickets: true, checkin: true },
  configured: true,
  requested_plan: null,
  requested_cycle: null,
  subscription_status: null,
  usage: { events_per_month: 1, registrations_per_month: 40, committee_seats: 1, announcements_per_month: 0 },
};

const GROWTH_ENTITLEMENTS = { ...FREE_ENTITLEMENTS, plan_key: "growth", plan_name: "Growth", status: "active", cycle: "yearly", current_period_end: GROWTH_ACTIVE.current_period_end, limits: growth.limits, subscription_status: "active" };

type State = { me: unknown; sub: unknown; ent: Record<string, unknown>; plans: unknown; start: () => unknown; cancel: () => unknown };

const state = {} as State;
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") return state.me;
        if (path === "/api/v1/clubs/info") return clubInfo;
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
        if (path === "/api/v1/clubs/subscription/cancel") return state.cancel();
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { BillingPage, cancelConsequence } = await import("./components/billing-page");
const { entitlementsSchema, catalogSchema, subscriptionSchema, priceLine, blocksCheckout, cancellable } = await import("./schemas");
const { billingErrorMessage } = await import("./queries");

/** Razorpay's constructor as checkout.js defines it, recording what it was opened with. */
let opened: Array<Record<string, unknown>> = [];
let razorpayDoes: "authorise" | "dismiss" = "authorise";

const STARTED = {
  checkout_url: "https://rzp.io/i/abc",
  razorpay_subscription_id: "sub_test_123",
  status: "pending",
  razorpay_status: "created",
  plan_key: "growth",
  cycle: "yearly",
  trial_days: 14,
  expires_at: "2026-10-18T09:00:00+05:30",
};

beforeEach(() => {
  calls.length = 0;
  opened = [];
  razorpayDoes = "authorise";
  Object.assign(state, {
    me: OWNER,
    sub: null,
    ent: FREE_ENTITLEMENTS,
    plans,
    start: () => STARTED,
    cancel: () => ({ ...GROWTH_ACTIVE, cancel_at_period_end: true, cancel_requested_at: "2026-10-17T10:00:00+05:30" }),
  });
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
const currentPanel = () => screen.findByRole("region", { name: "Current plan" });

describe("the shapes", () => {
  it("parses the catalogue, a subscription and entitlements with usage", () => {
    expect(catalogSchema.parse(plans).plans.map((p) => p.key)).toEqual(["free", "starter", "growth", "pro", "campus", "enterprise"]);
    const sub = subscriptionSchema.parse(GROWTH_PENDING);
    expect(sub).toMatchObject({ status: "pending", entitled: false, checkout_expires_at: GROWTH_PENDING.checkout_expires_at });
    const ent = entitlementsSchema.parse({ ...FREE_ENTITLEMENTS, requested_plan: "growth", requested_cycle: "yearly", subscription_status: "pending" });
    expect(ent).toMatchObject({ requested_plan: "growth", requested_cycle: "yearly", subscription_status: "pending", usage: { events_per_month: 1 } });
  });

  it("refuses a status it does not know rather than guess", () => {
    expect(subscriptionSchema.safeParse({ ...GROWTH_ACTIVE, status: "on_hold" }).success).toBe(false);
    for (const status of ["pending", "trial", "active", "past_due", "paused", "cancelled"]) {
      expect(subscriptionSchema.safeParse({ ...GROWTH_ACTIVE, status }).success).toBe(true);
    }
  });

  it("prices a month, and a year as its monthly share", () => {
    const g = catalogSchema.parse(plans).plans[2]!;
    expect(priceLine(g, "monthly")).toEqual({ amount: "₹999", per: "/ month", note: "Billed monthly" });
    expect(priceLine(g, "yearly")).toEqual({ amount: "₹833", per: "/ month", note: "₹9,990 billed yearly" });
  });

  it("knows when a new checkout would be refused and when there is anything to cancel", () => {
    const active = subscriptionSchema.parse(GROWTH_ACTIVE);
    const pending = subscriptionSchema.parse(GROWTH_PENDING);
    expect(blocksCheckout(active)).toBe(true);
    expect(blocksCheckout(pending)).toBe(false);
    expect(blocksCheckout({ ...active, razorpay_subscription_id: null })).toBe(false);
    expect(cancellable(active)).toBe(true);
    expect(cancellable(pending)).toBe(true);
    expect(cancellable({ ...active, cancel_at_period_end: true })).toBe(false);
    expect(cancellable({ ...active, status: "cancelled" })).toBe(false);
    expect(cancellable({ ...active, razorpay_subscription_id: null })).toBe(false);
  });

  it("says what cancelling does in each state", () => {
    const sub = subscriptionSchema.parse(GROWTH_ACTIVE);
    expect(cancelConsequence(sub, "Growth")).toBe("Growth stays on until 15 Jan 2027, the end of what you've paid for. Razorpay won't charge you again, and then the club moves to Free.");
    expect(cancelConsequence({ ...sub, status: "trial", trial_ends_at: "2026-10-31T10:00:00+05:30" }, "Growth")).toMatch(/won't be charged\. You keep Growth until the trial ends on 31 Oct 2026/);
    expect(cancelConsequence({ ...sub, status: "past_due" }, "Growth")).toMatch(/^Razorpay stops trying to charge you now\. You keep Growth until 15 Jan 2027/);
    expect(cancelConsequence({ ...sub, status: "paused", current_period_end: null }, "Free")).toBe("The paused subscription is cancelled now and won't be charged again. The club stays on Free.");
    expect(cancelConsequence(subscriptionSchema.parse(GROWTH_PENDING), "Free")).toBe("The checkout for Growth is closed and nothing is charged. The club stays on Free.");
  });

  it("words every refusal by its code", () => {
    const err = (status: number, errorCode?: string) => new ApiError({ status, message: "server words", errorCode });
    expect(billingErrorMessage(err(409, "SUBSCRIPTION_EXISTS"))).toBe("You already have a subscription; cancel it first or talk to us to switch.");
    expect(billingErrorMessage(err(404, "PLAN_NOT_AVAILABLE"))).toMatch(/can't be bought online right now\. Write to support@myotherapp\.in/);
    expect(billingErrorMessage(err(422, "CONTACT_SALES"))).toMatch(/arranged with our team/);
    expect(billingErrorMessage(err(422, "FREE_PLAN"))).toMatch(/Free needs no subscription/);
    expect(billingErrorMessage(err(502, "CHECKOUT_NOT_CLOSED"))).toMatch(/hasn't confirmed your earlier checkout is closed/);
    expect(billingErrorMessage(err(409, "NO_SUBSCRIPTION"))).toBe("There is no paid subscription to cancel.");
    expect(billingErrorMessage(err(500))).toMatch(/can't be bought online right now/);
    expect(billingErrorMessage(err(403, "ROLE_FORBIDDEN"))).toBe("server words");
  });
});

describe("the plan the club is on", () => {
  it("is the plan that grants, with its status, cycle and renewal", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = GROWTH_ENTITLEMENTS;
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Growth")).toBeInTheDocument();
    expect(within(current).getByText("Active")).toBeInTheDocument();
    expect(within(current).getByText("₹9,990 billed yearly")).toBeInTheDocument();
    expect(within(current).getByText("Yearly")).toBeInTheDocument();
    expect(within(current).getByText("Renews 15 Jan 2027")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /Yearly/ })).toHaveAttribute("aria-checked", "true");
    expect(within(card("Growth")).getByText("Current plan")).toBeInTheDocument();
  });

  it("says when a cancelled plan ends, and where the club goes then", async () => {
    state.sub = { ...GROWTH_ACTIVE, cancel_at_period_end: true, cancel_requested_at: "2026-10-17T10:00:00+05:30" };
    state.ent = GROWTH_ENTITLEMENTS;
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Cancels on 15 Jan 2027")).toBeInTheDocument();
    expect(within(current).getByText(/You cancelled on 17 Oct 2026\. The club moves to Free after 15 Jan 2027/)).toBeInTheDocument();
    expect(within(current).queryByRole("button", { name: "Cancel plan" })).not.toBeInTheDocument();
    expect(within(await screen.findByRole("article", { name: "Free" })).getByText("The club moves here after 15 Jan 2027.")).toBeInTheDocument();
  });

  it("draws the four counted limits as bars, and shows the rest as what the plan includes", async () => {
    state.ent = { ...FREE_ENTITLEMENTS, limits: { ...free.limits, registrations_per_month: null }, usage: { events_per_month: 2, registrations_per_month: 120, committee_seats: 1, announcements_per_month: 0 } };
    render(<BillingPage />);
    const usage = await screen.findByRole("region", { name: "Usage" });
    expect(within(usage).getByText("Included in your plan")).toBeInTheDocument();
    const events = within(usage).getByRole("progressbar", { name: "Events: 2 of 2 included" });
    expect(events).toHaveAttribute("aria-valuenow", "2");
    expect(within(usage).getByText("2 of 2 included")).not.toHaveClass("text-refuse");
    expect(within(usage).getByText("120 used · Unlimited")).toBeInTheDocument();
    expect(within(usage).getByRole("progressbar", { name: "Announcements: 0 of 4 included" })).toBeInTheDocument();
    // Not counted: the cap alone, no bar.
    expect(within(usage).getByText("1 GB included")).toBeInTheDocument();
    expect(within(usage).getByText("100 included")).toBeInTheDocument();
    expect(within(usage).getAllByRole("progressbar")).toHaveLength(3);
    // Nothing offers ticket types or coupons yet, so they are not listed at all.
    expect(within(usage).queryByText("Ticket types")).not.toBeInTheDocument();
    expect(within(usage).queryByText("Coupon codes")).not.toBeInTheDocument();
    expect(within(usage).getByText("Not included")).toBeInTheDocument();
  });
});

describe("plans", () => {
  it("switch every price between monthly and yearly", async () => {
    render(<BillingPage />);
    const g = await screen.findByRole("article", { name: "Growth" });
    expect(within(g).getByText("₹999")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Yearly · 2 months free" }));
    expect(within(g).getByText("₹833")).toBeInTheDocument();
    expect(within(g).getByText("₹9,990 billed yearly")).toBeInTheDocument();
    expect(within(card("Enterprise")).getByText("Custom")).toBeInTheDocument();
    expect(within(card("Free")).getByText("Current plan")).toBeInTheDocument();
  });

  it("offer the plan picked at sign-up first, on the cycle picked", async () => {
    state.ent = { ...FREE_ENTITLEMENTS, requested_plan: "growth", requested_cycle: "yearly" };
    render(<BillingPage />);
    await waitFor(() => expect(within(card("Growth")).getByText("Picked at sign-up")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /Yearly/ })).toHaveAttribute("aria-checked", "true");
    expect(within(card("Pro")).queryByText("Picked at sign-up")).not.toBeInTheDocument();
  });

  it("start a checkout by key and open Razorpay with its subscription id", async () => {
    render(<BillingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: /Yearly/ }));
    fireEvent.click(within(card("Growth")).getByRole("button", { name: "Upgrade to Growth — Growth" }));

    await waitFor(() => expect(opened).toHaveLength(1));
    expect(posts()).toEqual([{ method: "POST", path: "/api/v1/clubs/subscription/start", body: { plan_key: "growth", cycle: "yearly" } }]);
    expect(opened[0]).toMatchObject({ key: "rzp_test_not_a_real_key", subscription_id: "sub_test_123", name: "MyOtherApp", description: "Growth · yearly" });
    expect(await screen.findByText(/Payment authorised\. Razorpay is confirming it/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Razorpay to confirm");
  });

  it("say nothing was charged when checkout is closed, and until when it can be finished", async () => {
    razorpayDoes = "dismiss";
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Starter" })).findByRole("button", { name: "Upgrade to Starter — Starter" }));
    expect(await screen.findByText(new RegExp(`nothing was charged and your plan hasn't changed\\. You can finish or cancel it from Current plan until ${formatDateTime(STARTED.expires_at)}`))).toBeInTheDocument();
    expect(posts()[0]?.body).toEqual({ plan_key: "starter", cycle: "monthly" });
  });

  it("hand over Razorpay's own checkout page when this build has no key", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "");
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Pro" })).findByRole("button", { name: /Upgrade to Pro/ }));
    expect(await screen.findByRole("link", { name: "Open checkout" })).toHaveAttribute("href", "https://rzp.io/i/abc");
    expect(opened).toHaveLength(0);
  });

  it("say why a checkout was refused", async () => {
    state.start = () => {
      throw new ApiError({ status: 409, message: "This club already has a subscription.", errorCode: "SUBSCRIPTION_EXISTS" });
    };
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Campus" })).findByRole("button", { name: /Upgrade to Campus/ }));
    expect(await screen.findByText("You already have a subscription; cancel it first or talk to us to switch.")).toBeInTheDocument();
    expect(opened).toHaveLength(0);
  });

  it("send Enterprise to a conversation, and switching a running plan to people, not a second subscription", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = GROWTH_ENTITLEMENTS;
    render(<BillingPage />);
    const enterprise = await screen.findByRole("article", { name: "Enterprise" });
    expect(within(enterprise).getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", expect.stringMatching(/^mailto:support@myotherapp\.in\?subject=Enterprise%20plan/));
    expect(within(card("Pro")).getByRole("link", { name: "Talk to us to switch" })).toBeInTheDocument();
    expect(within(card("Free")).getByRole("button", { name: "Move to Free" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade|Switch/ })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
});

describe("a checkout waiting for payment", () => {
  beforeEach(() => {
    state.sub = GROWTH_PENDING;
    state.ent = { ...FREE_ENTITLEMENTS, subscription_status: "pending" };
    state.cancel = () => ({ ...GROWTH_PENDING, status: "cancelled", razorpay_subscription_id: "sub_waiting", pending_since: null, checkout_expires_at: null });
  });

  it("keeps the club on what it had and says until when the link works", async () => {
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Free")).toBeInTheDocument();
    expect(within(current).getByText("Waiting for payment — finish checkout")).toBeInTheDocument();
    expect(current).toHaveTextContent(`for Growth (monthly). Nothing is charged or changed until you do. The link expires ${formatDateTime(GROWTH_PENDING.checkout_expires_at)}.`);
    expect(within(await screen.findByRole("article", { name: "Growth" })).getByText("Waiting for payment")).toBeInTheDocument();
    expect(within(card("Free")).getByText("Current plan")).toBeInTheDocument();
  });

  it("reopens the same Razorpay subscription to finish it", async () => {
    render(<BillingPage />);
    fireEvent.click(within(await currentPanel()).getByRole("button", { name: "Finish checkout" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toMatchObject({ subscription_id: "sub_waiting" });
    expect(posts()).toHaveLength(0);
  });

  it("cancels it after saying what that does", async () => {
    render(<BillingPage />);
    fireEvent.click(within(await currentPanel()).getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Cancel this checkout?")).toBeInTheDocument();
    expect(within(dialog).getByText("The checkout for Growth is closed and nothing is charged. The club stays on Free.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel checkout" }));
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", path: "/api/v1/clubs/subscription/cancel", body: undefined }]));
    expect(await screen.findByText("Checkout cancelled. Nothing was charged, and your plan is as it was.")).toBeInTheDocument();
  });

  it("still lets the club start a different plan, which replaces the unpaid checkout", async () => {
    render(<BillingPage />);
    expect(await within(await screen.findByRole("article", { name: "Pro" })).findByRole("button", { name: /Upgrade to Pro/ })).toBeEnabled();
  });
});

describe("cancelling a plan", () => {
  it("confirms what happens, cancels, and says until when the plan stays", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = GROWTH_ENTITLEMENTS;
    render(<BillingPage />);
    fireEvent.click(within(await currentPanel()).getByRole("button", { name: "Cancel plan" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Cancel Growth?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Growth stays on until 15 Jan 2027, the end of what you've paid for/)).toBeInTheDocument();
    state.sub = { ...GROWTH_ACTIVE, cancel_at_period_end: true, cancel_requested_at: "2026-10-17T10:00:00+05:30" };
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel plan" }));
    expect(await screen.findByText("Cancelled. Growth stays on until 15 Jan 2027, then the club moves to Free.")).toBeInTheDocument();
    expect(posts()).toEqual([{ method: "POST", path: "/api/v1/clubs/subscription/cancel", body: undefined }]);
    expect(await within(await currentPanel()).findByText("Cancels on 15 Jan 2027")).toBeInTheDocument();
  });

  it("explains a trial ends at once at Razorpay", async () => {
    state.sub = { ...GROWTH_ACTIVE, status: "trial", trial_ends_at: "2026-10-31T10:00:00+05:30", current_period_end: "2026-10-31T10:00:00+05:30", mrr_paise: 0 };
    state.ent = { ...GROWTH_ENTITLEMENTS, status: "trial", current_period_end: "2026-10-31T10:00:00+05:30" };
    render(<BillingPage />);
    expect(within(await currentPanel()).getByText("Trial ends 31 Oct 2026")).toBeInTheDocument();
    fireEvent.click(within(await currentPanel()).getByRole("button", { name: "Cancel plan" }));
    expect(within(await screen.findByRole("alertdialog")).getByText(/Razorpay stops the subscription now, so you won't be charged\. You keep Growth until the trial ends on 31 Oct 2026/)).toBeInTheDocument();
  });

  it("shows a paused subscription as not on, and still cancellable", async () => {
    state.sub = { ...GROWTH_ACTIVE, status: "paused", entitled: false, mrr_paise: 0 };
    state.ent = { ...FREE_ENTITLEMENTS, subscription_status: "paused" };
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText(/Razorpay has paused this subscription, so it isn't charged and Growth isn't on/)).toBeInTheDocument();
    expect(within(current).getByRole("button", { name: "Cancel plan" })).toBeInTheDocument();
  });

  it("says plainly when there is nothing to cancel", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = GROWTH_ENTITLEMENTS;
    state.cancel = () => {
      throw new ApiError({ status: 409, message: "There is no paid subscription to cancel.", errorCode: "NO_SUBSCRIPTION" });
    };
    render(<BillingPage />);
    fireEvent.click(within(await currentPanel()).getByRole("button", { name: "Cancel plan" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel plan" }));
    expect(await screen.findByText("There is no paid subscription to cancel.")).toBeInTheDocument();
  });
});

describe("who can change it", () => {
  it("is read-only for a team member: the plan shows, nothing can be changed", async () => {
    state.me = EDITOR;
    state.sub = GROWTH_PENDING;
    state.ent = { ...FREE_ENTITLEMENTS, requested_plan: "growth", requested_cycle: "monthly", subscription_status: "pending" };
    render(<BillingPage />);
    expect(await screen.findByText(/Only the club's own account can change the plan/)).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Growth" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade|Switch|Finish|Cancel|Move to Free/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Talk to us/ })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("keeps the plan and usage when the catalogue is not there", async () => {
    state.plans = new ApiError({ status: 503, message: "Unavailable" });
    render(<BillingPage />);
    expect(await screen.findByText("Plans are not available right now")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Current plan" })).toHaveTextContent("Free");
  });
});

describe("a failed charge in its grace period", () => {
  const PAST_DUE = {
    ...GROWTH_ACTIVE,
    status: "past_due",
    last_failure_reason: "Card declined by the bank.",
    grace_ends_at: "2026-10-24T10:00:00+05:30",
    halted_at: null,
  };

  it("says by when to pay or the club moves to Free, that Razorpay retries, and how to change the card", async () => {
    state.sub = PAST_DUE;
    state.ent = { ...GROWTH_ENTITLEMENTS, status: "past_due", subscription_status: "past_due" };
    render(<BillingPage />);
    const banner = (await screen.findByText(/Payment failed — update by 24 Oct 2026 or your club moves to Free\./)).closest<HTMLElement>("[role=alert]")!;
    expect(banner).toHaveTextContent("Razorpay said: Card declined by the bank.");
    expect(banner).toHaveTextContent(/Razorpay retries the charge on its own until then, and Growth stays on meanwhile/);
    expect(banner).toHaveTextContent(/open the link in Razorpay's email to .+ and update the payment method; the retry uses it/);
    expect(within(banner).getByRole("link", { name: /Talk to us/ })).toHaveAttribute("href", expect.stringContaining("mailto:support@myotherapp.in"));
    // The banner says it; the older past-due line would only repeat it.
    expect(screen.queryByText(/The last charge did not go through/)).not.toBeInTheDocument();
  });

  it("says Razorpay has stopped retrying once the subscription is halted", async () => {
    state.sub = { ...PAST_DUE, halted_at: "2026-10-20T10:00:00+05:30" };
    state.ent = { ...GROWTH_ENTITLEMENTS, status: "past_due", subscription_status: "past_due" };
    render(<BillingPage />);
    expect(await screen.findByText(/Razorpay has stopped retrying the charge, so Growth ends on 24 Oct 2026 unless a payment goes through/)).toBeInTheDocument();
  });

  it("takes the server's in_grace over the grace end", async () => {
    state.sub = { ...PAST_DUE, in_grace: false };
    state.ent = { ...GROWTH_ENTITLEMENTS, status: "past_due", subscription_status: "past_due" };
    render(<BillingPage />);
    await currentPanel();
    expect(screen.queryByText(/Payment failed — update by/)).not.toBeInTheDocument();
    // Not in grace, still past due: the plain past-due line says so.
    expect(screen.getByText(/The last charge did not go through/)).toBeInTheDocument();
  });

  it("shows nothing about grace when nothing is owed", async () => {
    state.sub = GROWTH_ACTIVE;
    state.ent = GROWTH_ENTITLEMENTS;
    render(<BillingPage />);
    await currentPanel();
    expect(screen.queryByText(/Payment failed — update by/)).not.toBeInTheDocument();
  });

  it("reads the new fields, and a server without them", () => {
    expect(subscriptionSchema.parse(PAST_DUE)).toMatchObject({ grace_ends_at: PAST_DUE.grace_ends_at, halted_at: null });
    expect(subscriptionSchema.parse(GROWTH_ACTIVE).grace_ends_at ?? null).toBeNull();
    // No `enforced` from the server is the kill switch: nothing is locked.
    const old = entitlementsSchema.parse(FREE_ENTITLEMENTS);
    expect(old.enforced).toBe(false);
    expect(old.grandfathered_before ?? null).toBeNull();
    expect(entitlementsSchema.parse({ ...FREE_ENTITLEMENTS, enforced: true, grandfathered_before: "2026-10-01T00:00:00+05:30" })).toMatchObject({ enforced: true, grandfathered_before: "2026-10-01T00:00:00+05:30" });
  });
});

describe("a plan given free by MyOtherApp", () => {
  /** An admin gave the club Growth free: no Razorpay subscription, nothing billed. */
  const COMP_SUB = { ...GROWTH_ACTIVE, razorpay_subscription_id: null, mrr_paise: 0, complimentary: true, comp_ends_at: "2027-03-31T23:59:59+05:30" };
  const COMP_ENT = { ...GROWTH_ENTITLEMENTS, complimentary: true, comp_ends_at: "2027-03-31T23:59:59+05:30" };

  it("says who provides the plan and until when, with no checkout and nothing to cancel", async () => {
    state.sub = COMP_SUB;
    state.ent = COMP_ENT;
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Growth — provided free by MyOtherApp until 31 Mar 2027")).toBeInTheDocument();
    expect(within(current).getByText("Free from MyOtherApp")).toBeInTheDocument();
    expect(within(current).getByRole("link", { name: /Talk to us to change your plan/ })).toHaveAttribute("href", expect.stringMatching(/^mailto:support@myotherapp\.in\?subject=Our%20Growth%20plan/));
    expect(within(current).queryByText(/billed/)).not.toBeInTheDocument();

    expect(await screen.findByRole("article", { name: "Pro" })).toBeInTheDocument();
    expect(within(card("Growth")).getByText("Current plan")).toBeInTheDocument();
    expect(within(card("Pro")).getByText("Talk to us to change your plan.")).toBeInTheDocument();
    expect(within(card("Free")).getByText("Talk to us to change your plan.")).toBeInTheDocument();
    // Nothing to buy, switch to or cancel.
    expect(screen.queryByRole("button", { name: /Upgrade|Switch|Cancel|Move to Free|Finish/ })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("says so when the free plan has no end date, from the entitlements alone", async () => {
    state.sub = null;
    state.ent = { ...COMP_ENT, comp_ends_at: null };
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Growth — provided free by MyOtherApp with no end date")).toBeInTheDocument();
  });

  it("is read the same by a team member, without the mail link", async () => {
    state.me = EDITOR;
    state.sub = COMP_SUB;
    state.ent = COMP_ENT;
    render(<BillingPage />);
    const current = await currentPanel();
    expect(within(current).getByText("Growth — provided free by MyOtherApp until 31 Mar 2027")).toBeInTheDocument();
    expect(within(current).queryByRole("link")).not.toBeInTheDocument();
    expect(within(current).getByText("Talk to us to change your plan.")).toBeInTheDocument();
  });

  it("reads the new fields, and a server without them", () => {
    expect(subscriptionSchema.parse(COMP_SUB)).toMatchObject({ complimentary: true, comp_ends_at: COMP_SUB.comp_ends_at });
    expect(subscriptionSchema.parse(GROWTH_ACTIVE)).toMatchObject({ complimentary: false });
    expect(entitlementsSchema.parse(COMP_ENT)).toMatchObject({ complimentary: true, comp_ends_at: COMP_ENT.comp_ends_at });
    expect(entitlementsSchema.parse(FREE_ENTITLEMENTS).complimentary).toBe(false);
  });

  it("answers a checkout refused because the plan was given free, and reads the plan again", async () => {
    // The page loaded before the admin gave the plan: it still offers checkout.
    state.start = () => {
      state.sub = COMP_SUB;
      state.ent = COMP_ENT;
      throw new ApiError({ status: 409, message: "This club's plan is complimentary.", errorCode: "COMPLIMENTARY_PLAN" });
    };
    render(<BillingPage />);
    fireEvent.click(await within(await screen.findByRole("article", { name: "Campus" })).findByRole("button", { name: /Upgrade to Campus/ }));
    expect(await screen.findByText(/MyOtherApp provides your plan free, so there is nothing to buy or cancel here/)).toBeInTheDocument();
    expect(opened).toHaveLength(0);
    expect(await screen.findByText("Growth — provided free by MyOtherApp until 31 Mar 2027")).toBeInTheDocument();
    expect(billingErrorMessage(new ApiError({ status: 409, message: "x", errorCode: "COMPLIMENTARY_PLAN" }))).toMatch(/^MyOtherApp provides your plan free/);
  });
});
