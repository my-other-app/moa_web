import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Giving a club a plan directly, free by default, against the contract the
 * backend is building: PUT /admin/subscriptions/club/{id}/plan takes
 * {plan_id, cycle, complimentary, reason, ends_at, cancel_razorpay?}, answers
 * 409 LIVE_SUBSCRIPTION for a club paying through Razorpay and 422 for a bad
 * form; rows carry complimentary / comp_reason / comp_ends_at / granted_by;
 * the list takes ?complimentary=; totals carry `complimentary`.
 */
let role: string | null = "owner";
let rows: Array<Record<string, unknown>> = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
const posts: Array<{ path: string; body?: Record<string, unknown> }> = [];
/** Refusals for the next PUTs, in order. */
let refusals: ApiError[] = [];

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 3,
    key: "growth",
    name: "Growth",
    price_monthly_paise: 149900,
    price_yearly_paise: 1499000,
    trial_days: 14,
    visibility: "public",
    contact_sales: false,
    limits: {},
    features: {},
    feature_groups: {},
    ...over,
  };
}

const PLANS = [
  plan({ id: 1, key: "free", name: "Free", price_monthly_paise: 0, price_yearly_paise: 0 }),
  plan(),
  plan({ id: 4, key: "pro", name: "Pro", price_monthly_paise: 299900, price_yearly_paise: 2999000 }),
  plan({ id: 7, key: "sponsor_2026", name: "Sponsor 2026", visibility: "hidden" }),
  plan({ id: 6, key: "enterprise", name: "Enterprise", contact_sales: true }),
];

function row(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    club: { id: 5, name: "Circuit" },
    plan: plan(),
    cycle: "monthly",
    status: "active",
    current_period_end: "2026-11-17T10:00:00+05:30",
    mrr_paise: 149900,
    razorpay_subscription_id: "sub_1",
    entitled: true,
    cancel_at_period_end: false,
    ...over,
  };
}

/** Growth, given free until the end of March by Deepu. */
const FREE_ROW = row({
  id: 12,
  club: { id: 8, name: "Drama" },
  status: "active",
  mrr_paise: 0,
  razorpay_subscription_id: null,
  current_period_end: null,
  complimentary: true,
  comp_reason: "Sponsored by the tech fest",
  comp_ends_at: "2027-03-31T23:59:59+05:30",
  granted_by: { id: 1, name: "Deepu" },
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/admin/plans") return PLANS;
        if (path === "/api/v1/admin/subscriptions/totals") {
          return { mrr_paise: 2500000, arr_paise: 30000000, active_subscriptions: 18, trialing: 2, past_due: 0, cancelled: 0, pending: 0, paused: 0, in_grace: 0, complimentary: 3 };
        }
        if (path === "/api/v1/admin/subscriptions") {
          const q = init?.query ?? {};
          let items = rows;
          if (q.complimentary === true) items = items.filter((r) => r.complimentary === true);
          // A server that ignores club_id still narrows by name; the client picks by id.
          if (q.search) items = items.filter((r) => String((r.club as { name: string }).name).toLowerCase().includes(String(q.search).toLowerCase()));
          return { limit: 25, offset: 0, total: items.length, next: null, items };
        }
        if (path === "/api/v1/clubs/admin/list") {
          return { limit: 8, offset: 0, total: 1, next: null, items: [{ id: 9, name: "Robotics", slug: "robotics", logo: null, is_verified: true, org: { id: 2, name: "CET" } }] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: Record<string, unknown>) => {
        puts.push({ path, body });
        const refusal = refusals.shift();
        if (refusal) throw refusal;
        const clubId = Number(path.split("/").at(-2));
        const chosen = PLANS.find((p) => p.id === body.plan_id);
        return row({ club: { id: clubId, name: clubId === 9 ? "Robotics" : "Circuit" }, plan: chosen, complimentary: body.complimentary, comp_reason: body.reason ?? null, comp_ends_at: body.ends_at, mrr_paise: body.complimentary ? 0 : 149900 });
      }),
      post: vi.fn(async (path: string, body?: Record<string, unknown>) => {
        posts.push({ path, body });
        return { ...FREE_ROW, status: "cancelled", complimentary: false };
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubPlanPanel, GivePlanDialog, SubscribersTab, SubscriptionsV2, givablePlans } = await import("./index");
const { givePlanProblems, givePlanPayload, givePlanSummary, freeBadgeText, subscriptionSchema, totalsSchema, planSchema } = await import("./schemas");

const NO_REASON = "Say why this club gets it free.";

beforeEach(() => {
  role = "owner";
  rows = [];
  gets.length = 0;
  puts.length = 0;
  posts.length = 0;
  refusals = [];
  // Only the calendar is fixed: the end date is checked against today.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T10:00:00+05:30"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function openFromPanel(club = { id: 5, name: "Circuit", is_verified: true }) {
  render(<ClubPlanPanel club={club} />);
  fireEvent.click(await screen.findByRole("button", { name: /Give plan|Change plan/ }));
  return screen.findByRole("dialog");
}

describe("the form's rules", () => {
  const base = { planId: 3, cycle: "monthly" as const, complimentary: true, reason: "Sponsored", endsOn: null };
  const today = new Date("2026-10-17T10:00:00+05:30");

  it("needs a plan, and a reason of at most 200 characters when free", () => {
    expect(givePlanProblems(base, today)).toEqual({});
    expect(givePlanProblems({ ...base, planId: null }, today).plan).toBe("Pick a plan.");
    expect(givePlanProblems({ ...base, reason: "   " }, today).reason).toBe(NO_REASON);
    expect(givePlanProblems({ ...base, reason: "x".repeat(201) }, today).reason).toBe("At most 200 characters.");
    expect(givePlanProblems({ ...base, reason: "x".repeat(200) }, today)).toEqual({});
    // A plan at its price needs no reason.
    expect(givePlanProblems({ ...base, complimentary: false, reason: "" }, today)).toEqual({});
  });

  it("takes an end date from today on, or none", () => {
    expect(givePlanProblems({ ...base, endsOn: "2026-10-17" }, today)).toEqual({});
    expect(givePlanProblems({ ...base, endsOn: "2026-10-16" }, today).endsOn).toBe("That day has passed.");
    expect(givePlanProblems({ ...base, endsOn: "" }, today).endsOn).toBe("Pick the day it ends.");
  });

  it("sends the end of the chosen day in India, the reason trimmed, and cancel_razorpay only when asked", () => {
    expect(givePlanPayload({ ...base, reason: "  Sponsored  ", endsOn: "2027-03-31" })).toEqual({
      plan_id: 3,
      cycle: "monthly",
      complimentary: true,
      reason: "Sponsored",
      ends_at: "2027-03-31T23:59:59+05:30",
    });
    expect(givePlanPayload(base, true)).toMatchObject({ ends_at: null, cancel_razorpay: true });
    // An end date means nothing for a plan at its price.
    expect(givePlanPayload({ ...base, complimentary: false, reason: "", endsOn: "2027-03-31" })).toEqual({ plan_id: 3, cycle: "monthly", complimentary: false, ends_at: null });
  });

  it("sums it up in a line", () => {
    const growth = planSchema.parse(plan());
    expect(givePlanSummary({ ...base, endsOn: "2027-03-31" }, growth)).toBe("Growth, free until 31 Mar 2027 — ₹0, not counted in revenue");
    expect(givePlanSummary(base, growth)).toBe("Growth, free with no end date — ₹0, not counted in revenue");
    expect(givePlanSummary({ ...base, complimentary: false, cycle: "yearly" }, growth)).toBe("Growth, yearly — ₹14,990 a year, counted in revenue. Nothing is charged through Razorpay.");
    expect(givePlanSummary(base, null)).toBeNull();
  });

  it("offers every plan but those priced in a conversation", () => {
    expect(givablePlans(PLANS.map((p) => planSchema.parse(p))).map((p) => p.name)).toEqual(["Free", "Growth", "Pro", "Sponsor 2026"]);
  });

  it("reads the free-plan fields, and a server without them", () => {
    expect(subscriptionSchema.parse(FREE_ROW)).toMatchObject({ complimentary: true, comp_reason: "Sponsored by the tech fest", granted_by: { id: 1, name: "Deepu" } });
    const paid = subscriptionSchema.parse(row());
    expect(paid.complimentary).toBe(false);
    expect(paid.comp_ends_at ?? null).toBeNull();
    expect(paid.granted_by ?? null).toBeNull();
    expect(totalsSchema.parse({}).complimentary).toBe(0);
    expect(freeBadgeText(subscriptionSchema.parse(FREE_ROW))).toBe("Free · until 31 Mar 2027");
    expect(freeBadgeText(subscriptionSchema.parse({ ...FREE_ROW, comp_ends_at: null }))).toBe("Free · no end date");
    expect(freeBadgeText(subscriptionSchema.parse(row()))).toBeNull();
  });
});

describe("give plan, from the club's page", () => {
  it("is there for a club with no subscription at all, which is on Free", async () => {
    render(<ClubPlanPanel club={{ id: 5, name: "Circuit", is_verified: true }} />);
    const panel = await screen.findByRole("region", { name: "Plan" });
    expect(await within(panel).findByText("No subscription")).toBeInTheDocument();
    expect(within(panel).getByText("Free")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Give plan/ })).toBeEnabled();
    // Asked by id and by name: the row is picked by id either way.
    expect(gets.find((g) => g.path === "/api/v1/admin/subscriptions")?.query).toMatchObject({ club_id: 5, search: "Circuit" });
  });

  it("is free by default, needs a reason, takes an end date and says what the club gets", async () => {
    const dialog = await openFromPanel();
    const free = within(dialog).getByRole("switch", { name: /Free for this club \(not counted as revenue\)/ });
    expect(free).toHaveAttribute("aria-checked", "true");

    const select = within(dialog).getByRole("combobox", { name: "Plan" });
    await waitFor(() => expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pick a plan", "Free", "Growth", "Pro", "Sponsor 2026 (hidden)"]));

    // Nothing picked, no reason: refused here, nothing sent.
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));
    expect(await within(dialog).findByText("Pick a plan.")).toBeInTheDocument();
    expect(within(dialog).getByText(NO_REASON)).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    fireEvent.change(select, { target: { value: "3" } });
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });
    expect(reason).toHaveAttribute("maxLength", "200");
    fireEvent.change(reason, { target: { value: "Sponsored by the tech fest" } });
    expect(within(dialog).getByText("Required. 26/200")).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Growth, free with no end date — ₹0, not counted in revenue");

    fireEvent.click(within(dialog).getByRole("radio", { name: /Ends on a date/ }));
    const ends = within(dialog).getByLabelText("Ends on");
    fireEvent.change(ends, { target: { value: "2026-10-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));
    expect(await within(dialog).findByText("That day has passed.")).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    fireEvent.change(ends, { target: { value: "2027-03-31" } });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Growth, free until 31 Mar 2027 — ₹0, not counted in revenue");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Yearly" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      path: "/api/v1/admin/subscriptions/club/5/plan",
      body: { plan_id: 3, cycle: "yearly", complimentary: true, reason: "Sponsored by the tech fest", ends_at: "2027-03-31T23:59:59+05:30" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("gives a plan at its price when free is turned off: no reason, no end date", async () => {
    const dialog = await openFromPanel();
    await waitFor(() => expect(within(dialog).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Plan" }), { target: { value: "4" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: /Free for this club/ }));
    expect(within(dialog).queryByRole("textbox", { name: "Reason" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup", { name: "Ends" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Pro, monthly — ₹2,999 a month, counted in revenue.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Give plan" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.body).toEqual({ plan_id: 4, cycle: "monthly", complimentary: false, ends_at: null });
  });

  it("asks before cancelling a club's Razorpay subscription, and cancels it only when told to", async () => {
    refusals = [new ApiError({ status: 409, message: "This club pays through Razorpay.", errorCode: "LIVE_SUBSCRIPTION" })];
    rows = [row()];
    const dialog = await openFromPanel();
    // Changing a paying club's plan starts from the plan it is on.
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Plan" })).toHaveValue("3"));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), { target: { value: "Campus partner" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));

    expect(await within(dialog).findByText("This club pays through Razorpay. Cancel that subscription and give the free plan?")).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).not.toHaveProperty("cancel_razorpay");
    // A question, not a failure: no "Nothing was changed".
    expect(within(dialog).queryByText(/Nothing was changed/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel Razorpay and give the free plan" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.body).toMatchObject({ plan_id: 3, complimentary: true, reason: "Campus partner", cancel_razorpay: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a 422 in the dialog, field by field, and keeps it open", async () => {
    refusals = [new ApiError({ status: 422, message: "Some of the submitted values were not valid.", fieldErrors: { reason: ["Too long"] } })];
    const dialog = await openFromPanel();
    await waitFor(() => expect(within(dialog).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Plan" }), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), { target: { value: "Sponsored" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));
    expect(await within(dialog).findByText("Some of the submitted values were not valid — reason: Too long. Nothing was changed.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("waits for an unapproved club to be approved", async () => {
    render(<ClubPlanPanel club={{ id: 5, name: "Circuit", is_verified: false }} />);
    expect(await screen.findByRole("button", { name: /Give plan/ })).toBeDisabled();
    expect(screen.getByText("Approve the club before giving it a plan.")).toBeInTheDocument();
  });

  it("shows a free plan with its badge, why and by whom, and ends it", async () => {
    rows = [FREE_ROW];
    render(<ClubPlanPanel club={{ id: 8, name: "Drama", is_verified: true }} />);
    const panel = await screen.findByRole("region", { name: "Plan" });
    expect(await within(panel).findByText("Free · until 31 Mar 2027")).toBeInTheDocument();
    expect(within(panel).getByText("Growth")).toBeInTheDocument();
    expect(within(panel).getByText(/₹0 · not counted in revenue/)).toBeInTheDocument();
    expect(within(panel).getByText("Sponsored by the tech fest · Given by Deepu")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: /End free plan/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("End Drama's free plan?");
    fireEvent.click(within(dialog).getByRole("button", { name: "End free plan" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/subscriptions/12/cancel", body: { at_period_end: false } }]));
  });

  it("is not offered to support or a viewer", async () => {
    for (const r of ["support", "viewer"]) {
      role = r;
      rows = [FREE_ROW];
      const { unmount } = render(<ClubPlanPanel club={{ id: 8, name: "Drama", is_verified: true }} />);
      expect(await screen.findByText("Free · until 31 Mar 2027")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Give plan|Change plan|End free plan/ })).not.toBeInTheDocument();
      unmount();
      // And the dialog itself renders nothing for them.
      const dialog = render(<GivePlanDialog club={{ id: 8, name: "Drama" }} onClose={() => {}} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      dialog.unmount();
    }
    expect(puts).toHaveLength(0);
  });
});

describe("give plan, from Subscriptions", () => {
  it("picks any approved club, not only those with a subscription", async () => {
    render(<SubscriptionsV2 />);
    fireEvent.click(await screen.findByRole("button", { name: /Give a plan/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Give a club a plan" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Club" }), { target: { value: "Robo" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Robotics/ }));
    // Approved clubs only.
    expect(gets.find((g) => g.path === "/api/v1/clubs/admin/list")?.query).toMatchObject({ search: "Robo", is_verified: true });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Plan" }), { target: { value: "7" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), { target: { value: "Founding club" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ path: "/api/v1/admin/subscriptions/club/9/plan", body: { plan_id: 7, complimentary: true, reason: "Founding club", ends_at: null } });
  });

  it("counts free plans on the headline", async () => {
    render(<SubscriptionsV2 />);
    const tile = await screen.findByRole("group", { name: "Free plans" });
    expect(within(tile).getByText("3")).toBeInTheDocument();
    expect(tile).toHaveTextContent("not revenue");
  });

  it("is not offered to support", async () => {
    role = "support";
    render(<SubscriptionsV2 />);
    await screen.findByRole("group", { name: "Free plans" });
    expect(screen.queryByRole("button", { name: /Give a plan/ })).not.toBeInTheDocument();
  });
});

describe("free plans in the Subscribers list", () => {
  const rowOf = async (club: string) => (await screen.findAllByText(club)).map((el) => el.closest<HTMLElement>("div.rule-fade")).find(Boolean)!;

  it("badges a free plan with its end, earns nothing, and says why on hover", async () => {
    rows = [row(), FREE_ROW, { ...FREE_ROW, id: 13, club: { id: 10, name: "Quiz" }, comp_ends_at: null }];
    render(<SubscribersTab />);
    const drama = await rowOf("Drama");
    const badge = within(drama).getAllByText("Free · until 31 Mar 2027")[0]!;
    expect(badge.closest("[title]")).toHaveAttribute("title", "Sponsored by the tech fest · Given by Deepu");
    expect(within(drama).getAllByText("Free").length).toBeGreaterThan(0);
    expect(within(drama).queryByText(/₹/)).not.toBeInTheDocument();
    expect(within(await rowOf("Quiz")).getAllByText("Free · no end date").length).toBeGreaterThan(0);
    expect(within(await rowOf("Circuit")).queryByText(/^Free ·/)).not.toBeInTheDocument();
    // The plan is changed from the row's actions now, never from a dropdown that fires on touch.
    expect(screen.queryByRole("combobox", { name: /Plan for/ })).not.toBeInTheDocument();
  });

  it("filters to the free plans", async () => {
    rows = [row(), FREE_ROW];
    render(<SubscribersTab />);
    await rowOf("Circuit");
    const chip = screen.getByRole("button", { name: "Free plans" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    await waitFor(() => expect(gets.filter((g) => g.path === "/api/v1/admin/subscriptions").at(-1)?.query).toMatchObject({ complimentary: true, offset: 0 }));
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.queryByText("Circuit")).not.toBeInTheDocument());
    fireEvent.click(chip);
    await waitFor(() => expect(gets.filter((g) => g.path === "/api/v1/admin/subscriptions").at(-1)?.query).toMatchObject({ complimentary: undefined }));
  });

  it("ends a free plan from the row, with the existing cancel, and offers no Razorpay cancel for it", async () => {
    rows = [FREE_ROW];
    render(<SubscribersTab />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Actions for Drama" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /End free plan/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Cancel$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Retry charge|Extend grace/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /End free plan/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "End free plan" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/subscriptions/12/cancel", body: { at_period_end: false } }]));
  });

  it("changes a plan from the row, starting from what the club has", async () => {
    rows = [FREE_ROW];
    render(<SubscribersTab />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Actions for Drama" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Change plan/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Give Drama a plan" })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Plan" })).toHaveValue("3"));
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("Sponsored by the tech fest");
    expect(within(dialog).getByLabelText("Ends on")).toHaveValue("2027-03-31");
    fireEvent.click(within(dialog).getByRole("button", { name: "Give free plan" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ path: "/api/v1/admin/subscriptions/club/8/plan", body: { plan_id: 3, complimentary: true, ends_at: "2027-03-31T23:59:59+05:30" } });
  });

  it("offers a support role the badges but none of the actions", async () => {
    role = "support";
    rows = [FREE_ROW];
    render(<SubscribersTab />);
    expect((await screen.findAllByText("Free · until 31 Mar 2027")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });
});
