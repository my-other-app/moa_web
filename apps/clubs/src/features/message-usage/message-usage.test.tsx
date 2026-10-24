import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * "Messages this month", against GET /clubs/messages/usage and
 * /clubs/messages/history: the month's emails and WhatsApp against the
 * plan's limits, the extra and its estimated charge, Free's paused state and
 * an upgrade when it helps.
 */
let usageAnswer: unknown = null;
let historyAnswer: unknown = { items: [] };
let failUsage = false;

function channel(over: Record<string, unknown> = {}) {
  return { used: 0, limit: 1000, extra: 0, blocked: 0, rate_paise: 10, extra_paise: 0, percent: 0, state: "ok", kinds: {}, warned: [], ...over };
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
const { MessageUsageCard, paiseText, usedLine, extraLine, messageUsageSchema, wantsUpgrade } = await import("./index");

beforeEach(() => {
  usageAnswer = usage();
  historyAnswer = { items: [] };
  failUsage = false;
});

describe("the words", () => {
  it("writes prices to the paisa and counts against the limit", () => {
    expect([paiseText(10), paiseText(100), paiseText(2500), paiseText(234550)]).toEqual(["₹0.10", "₹1", "₹25", "₹2,345.50"]);
    const u = messageUsageSchema.parse(usage());
    expect(usedLine({ ...u.channels.email, used: 1240, limit: 5000 })).toBe("1,240 of 5,000");
    expect(usedLine({ ...u.channels.email, used: 1240, limit: null })).toBe("1,240 sent · no limit");
    expect(usedLine({ ...u.channels.whatsapp, used: 0, limit: 0 })).toBe("Not included");
  });

  it("says what the extra costs on a paid plan, and nothing is billed on Free", () => {
    const paid = messageUsageSchema.parse(usage({ channels: { email: channel({ used: 1250, extra: 250, extra_paise: 2500, state: "over" }), whatsapp: channel() } }));
    expect(extraLine(paid, "email")).toBe("250 extra emails · about ₹25 on your next bill (₹0.10 each)");
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

describe("Messages this month", () => {
  it("shows a paying club past its limit, the extra and its estimated charge", async () => {
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
    expect(within(card).getByText("250 extra emails · about ₹25 on your next bill (₹0.10 each)")).toBeInTheDocument();
    expect(within(card).getByText(/Estimated extra this month:/)).toHaveTextContent("Estimated extra this month: ₹25, added to your next bill.");
    expect(within(card).getByText("Pro includes 20,000 emails and 1,000 WhatsApp messages a month.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/billing");
    expect(within(card).getByText(/₹0.10 an email and ₹1 a WhatsApp message, added to your next bill/)).toBeInTheDocument();
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
    expect(within(months).getByText("₹40 extra · On your next bill")).toBeInTheDocument();
  });

  it("is left out of the overview when it cannot be read", async () => {
    failUsage = true;
    const { container } = render(<MessageUsageCard />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[aria-label="Messages this month"]')).toBeNull();
  });
});
