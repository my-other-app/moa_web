import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * "Messages this month", against GET /clubs/messages/usage and
 * /clubs/messages/history: the month's emails and WhatsApp against the
 * plan's allowance, then bought credits and the total left (prepaid
 * credits), the paused state with "Buy credits", an upgrade when it helps --
 * and a server from before credits, shown as a count with no money in it.
 */
let usageAnswer: unknown = null;
let historyAnswer: unknown = { items: [] };
let failUsage = false;

function channel(over: Record<string, unknown> = {}) {
  return { used: 0, limit: 1000, extra: 0, blocked: 0, rate_paise: 10, extra_paise: 0, percent: 0, state: "ok", kinds: {}, warned: [], ...over };
}

/** A channel as a prepaid server sends it. */
function prepaidChannel(over: Record<string, unknown> = {}) {
  return channel({ rate_paise: 0, plan_used: 0, plan_remaining: 1000, credits_used: 0, credits_remaining: 0, over: 0, total_remaining: 1000, ...over });
}

function usage(over: Record<string, unknown> = {}) {
  return {
    period: "2026-10",
    period_label: "October 2026",
    period_start: "2026-09-30T18:30:00+00:00",
    period_end: "2026-10-31T18:30:00+00:00",
    plan_key: "growth",
    plan_name: "Growth",
    billing: "razorpay",
    blocks_past_limit: false,
    custom: false,
    trial: null,
    channels: { email: channel(), whatsapp: channel({ limit: 250, rate_paise: 100 }) },
    estimated_extra_paise: 0,
    upgrade: null,
    ...over,
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/clubs/messages/usage") {
          if (failUsage) throw new Error("down");
          return usageAnswer;
        }
        if (path === "/api/v1/clubs/messages/history") return historyAnswer;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { MessageUsageCard, paiseText, usedLine, extraLine, messageUsageSchema, wantsUpgrade, wantsCredits, promotionalLine, isPrepaid, remainingLines } = await import("./index");

beforeEach(() => {
  usageAnswer = usage();
  historyAnswer = { items: [] };
  failUsage = false;
});

describe("promotional WhatsApp (pricing_adjust)", () => {
  it("counts promotional messages against the plan's cap, and says when they wait for next month", () => {
    const parse = (marketing: unknown, over: Record<string, unknown> = {}) =>
      messageUsageSchema.parse(usage({ channels: { email: channel(), whatsapp: channel({ limit: 1000, rate_paise: 150, marketing, ...over }) } })).channels.whatsapp;
    expect(promotionalLine(parse({ used: 12, limit: 200 }))).toBe("Promotional: 12 of 200 this month.");
    expect(promotionalLine(parse({ used: 200, limit: 200 }))).toBe(
      "Promotional: 200 of 200 this month. More promotional messages use bought credits, or wait for next month; tickets, certificates and reminders still go.",
    );
    expect(promotionalLine(parse({ used: 0, limit: 0 }))).toMatch(/isn't included on your plan; tickets, certificates and reminders still go/);
    // No cap (Enterprise), no WhatsApp at all (Free), or a server from before the cap: nothing to say.
    expect(promotionalLine(parse({ used: 3, limit: null }))).toBeNull();
    expect(promotionalLine(parse({ used: 0, limit: 0 }, { limit: 0 }))).toBeNull();
    expect(promotionalLine(parse(undefined))).toBeNull();
  });

  it("shows the promotional count under the WhatsApp bar, and no price per extra message", async () => {
    usageAnswer = usage({ channels: { email: channel(), whatsapp: channel({ used: 40, limit: 250, rate_paise: 150, marketing: { used: 7, limit: 50 } }) } });
    render(<MessageUsageCard />);
    expect(await screen.findByText("Promotional: 7 of 50 this month.")).toBeInTheDocument();
    expect(screen.queryByText(/next bill|₹1\.50/)).toBeNull();
  });
});

describe("the words", () => {
  it("writes prices to the paisa and counts against the limit", () => {
    expect([paiseText(10), paiseText(100), paiseText(2500), paiseText(234550)]).toEqual(["₹0.10", "₹1", "₹25", "₹2,345.50"]);
    const u = messageUsageSchema.parse(usage());
    expect(usedLine({ ...u.channels.email, used: 1240, limit: 5000 })).toBe("1,240 of 5,000");
    expect(usedLine({ ...u.channels.email, used: 1240, limit: null })).toBe("1,240 sent · no limit");
    expect(usedLine({ ...u.channels.whatsapp, used: 0, limit: 0 })).toBe("Not included");
  });

  it("never prices an extra message: a server from before credits shows the count past the allowance", () => {
    const paid = messageUsageSchema.parse(usage({ channels: { email: channel({ used: 1250, extra: 250, extra_paise: 2500, state: "over" }), whatsapp: channel() } }));
    expect(extraLine(paid, "email")).toBe("250 past your plan's allowance this month");
    const free = messageUsageSchema.parse(usage({ billing: "none", blocks_past_limit: true, channels: { email: channel({ used: 200, limit: 200, state: "blocked", blocked: 3 }), whatsapp: channel({ limit: 0, state: "not_included" }) } }));
    expect(extraLine(free, "email")).toBe("Limit reached: announcements, campaigns and reminders are paused until next month. Tickets and certificates still go. 3 held back so far.");
    expect(extraLine(free, "whatsapp")).toBeNull();
  });

  it("only offers an upgrade when something is near or past its limit and a plan has room", () => {
    const calm = messageUsageSchema.parse(usage({ upgrade: { plan_key: "pro", plan_name: "Pro", contact_sales: false, limits: {} } }));
    expect(wantsUpgrade(calm)).toBe(false);
    const near = messageUsageSchema.parse(usage({ channels: { email: channel({ used: 850, state: "near" }), whatsapp: channel() }, upgrade: { plan_key: "pro", plan_name: "Pro", contact_sales: false, limits: {} } }));
    expect(wantsUpgrade(near)).toBe(true);
  });
});

describe("prepaid credits", () => {
  it("reads the plan / bought / total split, and a server without it", () => {
    const u = messageUsageSchema.parse(
      usage({ billing: "prepaid", channels: { email: prepaidChannel({ used: 1200, plan_used: 1000, plan_remaining: 0, credits_used: 200, credits_remaining: 4800, total_remaining: 4800, state: "credits" }), whatsapp: prepaidChannel({ limit: null, plan_remaining: null, total_remaining: null, state: "unlimited" }) } }),
    );
    expect(isPrepaid(u)).toBe(true);
    expect(u.channels.email.state).toBe("credits");
    expect(usedLine(u.channels.email)).toBe("1,000 of 1,000");
    expect(remainingLines(u, "email")).toEqual({ plan: "0 of 1,000 left", bought: "4,800 left", total: "4,800 left" });
    expect(remainingLines(u, "whatsapp")).toEqual({ plan: "No limit", bought: "0 left", total: "No limit" });
    expect(extraLine(u, "email")).toBe("Your plan's 1,000 emails for October 2026 are used; sending on bought credits (4,800 left).");
    expect(wantsCredits(u)).toBe(true);
    // A server from before credits: no split, no "Buy credits".
    const old = messageUsageSchema.parse(usage());
    expect(isPrepaid(old)).toBe(false);
    expect(remainingLines(old, "email")).toBeNull();
    expect(wantsCredits(old)).toBe(false);
    expect(old.channels.email.plan_used ?? null).toBeNull();
  });

  it("shows plan, then bought, then the total left, and offers credits once the plan's allowance is used", async () => {
    usageAnswer = usage({
      billing: "prepaid",
      blocks_past_limit: true,
      channels: {
        email: prepaidChannel({ used: 1200, extra: 200, plan_used: 1000, plan_remaining: 0, credits_used: 200, credits_remaining: 4800, total_remaining: 4800, percent: 100, state: "credits" }),
        whatsapp: prepaidChannel({ used: 10, limit: 250, plan_used: 10, plan_remaining: 240, total_remaining: 240, percent: 4 }),
      },
    });
    render(<MessageUsageCard />);
    const card = await screen.findByRole("region", { name: "Messages this month" });
    expect(within(card).getByText("On bought credits")).toBeInTheDocument();
    const email = within(card).getByLabelText("Emails left");
    expect(within(email).getByText("0 of 1,000 left")).toBeInTheDocument();
    expect(within(email).getByText("4,800 left", { selector: "dd.font-medium" })).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "Emails: 1000 of 1000 this month" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Buy credits" })).toHaveAttribute("href", "/billing#credits");
    expect(within(card).getByText(/Your plan's monthly allowance is used first, then bought credits/)).toBeInTheDocument();
    expect(within(card).queryByText(/next bill|Estimated extra/)).toBeNull();
  });

  it("pauses announcements when plan and credits are both used up, with Buy credits leading to the Credits area", async () => {
    usageAnswer = usage({
      billing: "prepaid",
      blocks_past_limit: true,
      channels: {
        email: prepaidChannel({ used: 1003, extra: 3, plan_used: 1000, plan_remaining: 0, credits_remaining: 0, over: 3, total_remaining: 0, blocked: 7, percent: 100, state: "blocked" }),
        whatsapp: prepaidChannel({ limit: 250 }),
      },
      upgrade: { plan_key: "pro", plan_name: "Pro", contact_sales: false, limits: { emails_per_month: 20000 } },
    });
    render(<MessageUsageCard variant="billing" />);
    const card = await screen.findByRole("region", { name: "Messages this month" });
    const notice = within(card).getByRole("alert");
    expect(notice).toHaveTextContent("Growth's 1,000 emails for October 2026 and your bought email credits are used up.");
    expect(notice).toHaveTextContent("or until you buy credits");
    expect(within(notice).getByRole("link", { name: "Buy credits" })).toHaveAttribute("href", "#credits");
    expect(within(notice).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "#plans-title");
    expect(within(card).getByText(/7 held back so far\. 3 tickets, certificates or payment messages went anyway, never charged\./)).toBeInTheDocument();
  });

  it("lists a closed month's split, and a cancelled overage as not charged", async () => {
    usageAnswer = usage({ billing: "prepaid", channels: { email: prepaidChannel(), whatsapp: prepaidChannel() } });
    historyAnswer = {
      items: [
        { id: 202610, period: "2026-10", period_label: "October 2026", plan_key: "growth", billing: "prepaid", email: { used: 1200, limit: 1000, extra: 200, rate_paise: 0, plan_used: 1000, credits_used: 200, over: 0, blocked: 0 }, whatsapp: { used: 12, limit: 250, extra: 0, rate_paise: 0, plan_used: 12, credits_used: 0, over: 0, blocked: 0 }, amount_paise: 0, status: "nothing_due", charged_at: null },
        { id: 202609, period: "2026-09", period_label: "September 2026", plan_key: "growth", billing: "razorpay", email: { used: 5400, limit: 5000, extra: 400, rate_paise: 10 }, whatsapp: { used: 0, limit: 250, extra: 0, rate_paise: 100 }, amount_paise: 4000, status: "void", charged_at: null },
      ],
    };
    render(<MessageUsageCard variant="billing" />);
    const months = await screen.findByRole("list", { name: "Earlier months" });
    expect(within(months).getByText("1,200 emails (200 on bought credits) · 12 WhatsApp")).toBeInTheDocument();
    expect(within(months).getByText("Closed")).toBeInTheDocument();
    expect(within(months).getByText("Not charged")).toBeInTheDocument();
    expect(within(months).queryByText(/₹40/)).toBeNull();
  });
});

describe("Messages this month", () => {
  it("shows a club past its limit on a server from before credits, with no money in it", async () => {
    usageAnswer = usage({
      channels: {
        email: channel({ used: 1250, extra: 250, extra_paise: 2500, percent: 125, state: "over" }),
        whatsapp: channel({ used: 120, limit: 250, rate_paise: 100, percent: 48 }),
      },
      estimated_extra_paise: 2500,
      upgrade: { plan_key: "pro", plan_name: "Pro", contact_sales: false, limits: { emails_per_month: 20000, whatsapp_per_month: 1000 } },
    });
    render(<MessageUsageCard />);
    const card = await screen.findByRole("region", { name: "Messages this month" });
    expect(within(card).getByText("Past the limit")).toBeInTheDocument();
    expect(within(card).getByText("1,250 of 1,000")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "Emails: 1250 of 1000 this month" })).toBeInTheDocument();
    expect(within(card).getByText("250 past your plan's allowance this month")).toBeInTheDocument();
    expect(within(card).queryByText(/Estimated extra|next bill/)).toBeNull();
    expect(within(card).getByText("Pro includes 20,000 emails and 1,000 WhatsApp messages a month.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/billing");
    // Only a prepaid server sells credits.
    expect(within(card).queryByRole("link", { name: "Buy credits" })).toBeNull();
    expect(within(card).getByText(/Past your plan's allowance, messages keep going this month/)).toBeInTheDocument();
  });

  it("explains Free's paused state: announcements stop, tickets still go", async () => {
    usageAnswer = usage({
      plan_key: "free",
      plan_name: "Free",
      billing: "none",
      blocks_past_limit: true,
      channels: {
        email: channel({ used: 204, limit: 200, extra: 4, blocked: 12, percent: 102, state: "blocked" }),
        whatsapp: channel({ limit: 0, state: "not_included", rate_paise: 100 }),
      },
      upgrade: { plan_key: "starter", plan_name: "Starter", contact_sales: false, limits: { emails_per_month: 1000, whatsapp_per_month: 50 } },
    });
    render(<MessageUsageCard variant="billing" />);
    const card = await screen.findByRole("region", { name: "Messages this month" });
    // The card's badge, and the notice's tag.
    expect(within(card).getAllByText("Paused")).toHaveLength(2);
    const notice = within(card).getByRole("alert");
    expect(notice).toHaveTextContent("Free's 200 emails for October 2026 are used up.");
    expect(notice).toHaveTextContent("Tickets, certificates and payment messages still go");
    expect(notice).toHaveTextContent("Starter includes more.");
    // On Billing the upgrade goes to the plans below.
    expect(within(notice).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "#plans-title");
    expect(within(card).getByText("Not included")).toBeInTheDocument();
    expect(within(card).queryByText(/Estimated extra/)).toBeNull();
    expect(within(card).getByText(/Free has no card to charge/)).toBeInTheDocument();
  });

  it("lists the earlier months on Billing", async () => {
    historyAnswer = {
      items: [
        { id: 7, period: "2026-09", period_label: "September 2026", plan_key: "growth", billing: "razorpay", email: { used: 5400, limit: 5000, extra: 400, rate_paise: 10 }, whatsapp: { used: 12, limit: 250, extra: 0, rate_paise: 100 }, amount_paise: 4000, status: "charged", charged_at: "2026-10-01T01:00:00+05:30" },
      ],
    };
    render(<MessageUsageCard variant="billing" />);
    const months = await screen.findByRole("list", { name: "Earlier months" });
    expect(within(months).getByText("September 2026")).toBeInTheDocument();
    expect(within(months).getByText("₹40 · Charged before credits")).toBeInTheDocument();
  });

  it("is left out of the overview when it cannot be read", async () => {
    failUsage = true;
    const { container } = render(<MessageUsageCard />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[aria-label="Messages this month"]')).toBeNull();
  });
});
