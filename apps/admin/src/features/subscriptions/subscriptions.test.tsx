import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * The Subscriptions screen.
 *
 * Two kinds of mistake here are expensive and quiet: a price that drifts
 * because it round-tripped through a float, and a limit where "unlimited"
 * and "none allowed" get confused. Both are tested on the conversion
 * functions directly, because that is where they would happen.
 */
let role: string | null = "owner";
let plansResponse: unknown[] = [];

const FEATURE_GROUPS = {
  every_event: ["tickets", "certificates", "checkin", "reviews", "threads", "regform", "waitlist"],
  grow: ["coupons", "links", "merch", "swag", "quiz", "qa", "polls", "networking"],
  competitions: ["teams", "judging", "rounds", "badges", "sessions", "report"],
  club: ["website", "domain", "nobadge", "finance", "roles", "tfa", "payouts", "sso", "api"],
};

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    key: "growth",
    name: "Growth",
    tagline: "For active clubs",
    price_monthly_paise: 149900,
    price_yearly_paise: 1499000,
    trial_days: 14,
    visibility: "public",
    sort_order: 1,
    billable: true,
    subscriber_count: 12,
    limits: { events_per_month: 10, storage_gb: null, coupons_per_event: 0 },
    features: { tickets: true, sso: false },
    feature_groups: FEATURE_GROUPS,
    ...overrides,
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: {
        id: 1,
        username: "platform_admin",
        email: "a@b.c",
        full_name: "Admin",
        user_type: "admin",
        admin_role: role,
      },
    }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/admin/subscriptions/totals")) {
          return {
            mrr_paise: 2500000,
            arr_paise: 30000000,
            active_subscriptions: 18,
            trialing: 2,
            past_due: 3,
            cancelled: 1,
          };
        }
        if (path.includes("/admin/plans")) return plansResponse;
        if (path.includes("/admin/subscriptions")) {
          return { limit: 25, offset: 0, total: 0, next: null, items: [] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async () => ({})),
      put: vi.fn(async () => ({})),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SubscriptionsV2 } = await import("./components/subscriptions-v2");
const { toForm, toPayload, rupees, paise, yearlyPriceProblem, planSchema } =
  await import("./schemas");

beforeEach(() => {
  role = "owner";
  plansResponse = [plan()];
});

describe("money conversion", () => {
  it("round-trips a price through the form without drifting", () => {
    /*
     * The failure this prevents: ₹1,499.00 stored as a float, edited, and
     * saved back as ₹1,498.99. It surfaces in an annual reconciliation,
     * months after the cause is forgotten.
     */
    const parsed = planSchema.parse(plan({ price_monthly_paise: 149900 }));
    const form = toForm(parsed);
    const payload = toPayload(form);

    expect(form.price_monthly_rupees).toBe(1499);
    expect(payload.price_monthly_paise).toBe(149900);
  });

  it("round-trips an awkward amount exactly", () => {
    // 33.33 is the classic float casualty: 33.33 * 100 is 3332.9999... in
    // IEEE754, so a bare multiply truncates to 3332.
    expect(paise(33.33)).toBe(3333);
    expect(rupees(3333)).toBeCloseTo(33.33, 10);
    expect(paise(rupees(3333))).toBe(3333);
  });

  it("rejects a yearly price above twelve months", () => {
    const form = toForm(planSchema.parse(plan()));
    expect(yearlyPriceProblem(form)).toBeNull();

    const bad = { ...form, price_monthly_rupees: 1000, price_yearly_rupees: 13000 };
    expect(yearlyPriceProblem(bad)).toMatch(/twelve months/i);

    // Exactly twelve months is a legitimate "no discount" plan.
    const exact = { ...form, price_monthly_rupees: 1000, price_yearly_rupees: 12000 };
    expect(yearlyPriceProblem(exact)).toBeNull();
  });
});

describe("limits", () => {
  it("keeps unlimited and none-allowed apart", () => {
    /*
     * NULL means unlimited; 0 means the club may not do it at all. Collapsing
     * them is how a plan silently forbids something it meant to allow.
     */
    const parsed = planSchema.parse(plan());
    const form = toForm(parsed);

    expect(form.limits.storage_gb).toBeNull();
    expect(form.limits.coupons_per_event).toBe(0);
    // And both survive the trip back.
    expect(toPayload(form).limits.storage_gb).toBeNull();
    expect(toPayload(form).limits.coupons_per_event).toBe(0);
  });
});

describe("subscriptions screen", () => {
  it("shows MRR and the run rate derived from it", async () => {
    render(<SubscriptionsV2 />);
    // 2,500,000 paise = ₹25,000; ARR is twelve times that.
    expect(await screen.findByText("₹25,000")).toBeInTheDocument();
    expect(screen.getByText("₹3,00,000")).toBeInTheDocument();
  });

  it("counts past-due subscriptions on the headline", async () => {
    render(<SubscriptionsV2 />);
    await screen.findByText("₹25,000");

    const card = screen.getByRole("group", { name: "Past due" });
    expect(within(card).getByText("3")).toBeInTheDocument();
  });

  it("warns plainly when no plans exist, because nothing is gated then", async () => {
    /*
     * With no plans the resolver grants every club everything -- deliberate,
     * so introducing the domain did not lock anyone out, but invisible unless
     * the screen says so.
     */
    plansResponse = [];
    render(<SubscriptionsV2 />);

    expect(await screen.findByText("Nothing is gated yet")).toBeInTheDocument();
  });

  it("does not warn once a plan exists", async () => {
    render(<SubscriptionsV2 />);
    await screen.findByText("₹25,000");
    expect(screen.queryByText("Nothing is gated yet")).not.toBeInTheDocument();
  });

  it("offers the three tabs", async () => {
    render(<SubscriptionsV2 />);
    await screen.findByText("₹25,000");

    expect(screen.getByRole("tab", { name: /Subscribers/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Plans and features/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Compare plans/ })).toBeInTheDocument();
  });
});
