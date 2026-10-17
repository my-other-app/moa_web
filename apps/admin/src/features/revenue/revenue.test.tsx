import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import revenue from "../__fixtures__/revenue.json";
import charges from "../__fixtures__/revenue-charges.json";

/**
 * The Revenue page against the contract being built on the backend:
 * GET /admin/revenue?months= (MRR, counts, by plan and cycle, money collected
 * per month, renewals, ticket sales held for clubs), GET
 * /admin/revenue/charges?offset=&limit=&club_id=&month= ({items, total,
 * sum_paise}) and POST /admin/revenue/backfill ({scanned, inserted}).
 */
let role: string | null = "owner";
let failRevenue = false;
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/admin/revenue") {
          if (failRevenue) throw new Error("The revenue service is down");
          return revenue;
        }
        if (path === "/api/v1/admin/revenue/charges") {
          const offset = Number(init?.query?.offset ?? 0);
          const items = offset >= 40 ? charges.items.slice(0, 5) : charges.items;
          return { ...charges, items };
        }
        if (path === "/api/v1/clubs/admin/list") {
          return { limit: 8, offset: 0, total: 1, next: null, items: [{ id: 5, name: "Circuit", slug: "circuit", logo: null, is_verified: true }] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        posts.push(path);
        if (path === "/api/v1/admin/revenue/backfill") return { scanned: 120, inserted: 3 };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { RevenuePage, RevenueStrip, formatPaise, formatPaiseRounded, compactPaise, monthLabel, monthChange, revenueSchema, chargePageSchema } = await import("./index");

const chargeCalls = () => gets.filter((g) => g.path === "/api/v1/admin/revenue/charges");
const tile = (name: string) => screen.getByRole("group", { name });

beforeEach(() => {
  role = "owner";
  failRevenue = false;
  gets.length = 0;
  posts.length = 0;
});

describe("money, the Indian way", () => {
  it("groups paise as rupees in lakhs and crores, with paise only when there are some", () => {
    expect(formatPaise(1234567800)).toBe("₹1,23,45,678");
    expect(formatPaise(149950)).toBe("₹1,499.50");
    expect(formatPaise(0)).toBe("₹0");
    expect(formatPaiseRounded(149950)).toBe("₹1,500");
    expect(compactPaise(1234567800)).toBe("₹1.2Cr");
    expect(compactPaise(34500000)).toBe("₹3.5L");
    expect(compactPaise(1250000)).toBe("₹12.5k");
    expect(compactPaise(-99900)).toBe("−₹999");
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthChange(1498000, 1348100)).toEqual({ label: "+11%", direction: "up" });
    expect(monthChange(0, 0)).toBeNull();
  });

  it("reads the summary and a server that leaves parts out", () => {
    const full = revenueSchema.parse(revenue);
    expect(full.counts.complimentary).toBe(3);
    expect(full.series).toHaveLength(12);
    const bare = revenueSchema.parse({ mrr_paise: 0, arr_paise: 0 });
    expect(bare.counts.paying).toBe(0);
    expect(bare.by_cycle.yearly).toEqual({ paying: 0, mrr_paise: 0 });
    expect(bare.ticket_sales ?? null).toBeNull();
    expect(chargePageSchema.parse(charges).items[0]).toMatchObject({ id: "100", club: { id: 5 }, amount_paise: 149900 });
  });
});

describe("the revenue page", () => {
  it("shows the tiles: MRR, ARR, paying, trial, free plans, past due, this month and all time", async () => {
    render(<RevenuePage />);
    expect(await screen.findByRole("group", { name: "MRR" })).toHaveTextContent("₹1,23,45,678");
    expect(gets.find((g) => g.path === "/api/v1/admin/revenue")?.query).toEqual({ months: 12 });
    expect(tile("ARR")).toHaveTextContent("₹14,81,48,136");
    expect(tile("Paying clubs")).toHaveTextContent("18");
    expect(tile("Paying clubs")).toHaveTextContent("41 of 64 clubs are on Free");
    expect(tile("On trial")).toHaveTextContent("2");
    expect(tile("Free plans")).toHaveTextContent("3");
    expect(tile("Free plans")).toHaveTextContent("not revenue");
    expect(tile("Past due / in grace")).toHaveTextContent("3 / 2");
    const month = tile("Collected this month");
    expect(month).toHaveTextContent("₹14,980");
    expect(month).toHaveTextContent("vs ₹13,481 last month");
    expect(within(month).getByText("+11%")).toBeInTheDocument();
    expect(tile("All-time collected")).toHaveTextContent("₹85,927");
    expect(tile("All-time collected")).toHaveTextContent("₹2,498 refunded");
  });

  it("draws collected per month with refunds below the line, and says each month's figures on hover", async () => {
    render(<RevenuePage />);
    const chart = await screen.findByRole("img", { name: /Collected per month over 12 months, refunds below the line/ });
    // Eleven months collected something, two had refunds.
    expect(chart.querySelectorAll('[data-series="collected"]')).toHaveLength(11);
    expect(chart.querySelectorAll('[data-series="refunded"]')).toHaveLength(2);
    expect(screen.getByText("Refunded (below the line)")).toBeInTheDocument();

    const march = chart.querySelector('[data-month="2026-03"] rect')!;
    fireEvent.mouseEnter(march);
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Mar 2026");
    expect(tip).toHaveTextContent("Collected ₹4,497");
    expect(tip).toHaveTextContent("Refunded ₹1,499");
    fireEvent.mouseLeave(chart);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("tabulates each month, newest first, and breaks MRR down by plan and cycle", async () => {
    render(<RevenuePage />);
    const table = await screen.findByRole("table", { name: /Per month/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(12);
    expect(within(rows[0]!).getByRole("rowheader")).toHaveTextContent("Oct 2026");
    expect(rows[0]).toHaveTextContent("₹14,980");
    expect(within(rows[0]!).getAllByRole("cell").at(-1)).toHaveTextContent("1");
    const march = rows.find((r) => within(r).queryByRole("rowheader", { name: "Mar 2026" }))!;
    expect(march).toHaveTextContent("−₹1,499");

    const byPlan = screen.getByRole("region", { name: "By plan" });
    const growth = within(byPlan).getByRole("rowheader", { name: "Growth" }).closest("tr")!;
    expect(growth).toHaveTextContent("12");
    expect(growth).toHaveTextContent("₹17,988");
    const byCycle = screen.getByRole("region", { name: "By cycle" });
    expect(byCycle).toHaveTextContent("Monthly11 paying · ₹16,489/mo");
    expect(byCycle).toHaveTextContent("Yearly7 paying · ₹19,493/mo");
    const renewals = screen.getByRole("region", { name: "Upcoming renewals" });
    expect(renewals).toHaveTextContent("₹29,970");
    expect(renewals).toHaveTextContent("9 renewals due in the next 30 days");
  });

  it("keeps ticket sales in a box of their own, labelled as the clubs' money", async () => {
    render(<RevenuePage />);
    const box = await screen.findByRole("region", { name: "Ticket sales through MyOtherApp's account (held for clubs, not revenue)" });
    expect(box).toHaveTextContent("₹4,56,789");
    expect(box).toHaveTextContent("₹98,76,543");
    expect(box).toHaveTextContent("Paid out to clubs on their payout schedule.");
    // Not added to anything: the all-time tile is plan money only.
    expect(tile("All-time collected")).not.toHaveTextContent("₹98");
  });

  it("asks again for another window", async () => {
    render(<RevenuePage />);
    await screen.findByRole("group", { name: "MRR" });
    fireEvent.click(screen.getByRole("radio", { name: "24 months" }));
    await waitFor(() => expect(gets.filter((g) => g.path === "/api/v1/admin/revenue").at(-1)?.query).toEqual({ months: 24 }));
  });

  it("says why it could not load", async () => {
    failRevenue = true;
    render(<RevenuePage />);
    expect(await screen.findByText("Could not load revenue")).toBeInTheDocument();
    expect(screen.getByText("The revenue service is down")).toBeInTheDocument();
  });
});

describe("charges", () => {
  it("pages through them and says the sum of everything that matches", async () => {
    render(<RevenuePage />);
    const panel = await screen.findByRole("region", { name: "Charges" });
    expect(await within(panel).findByText("₹85,927 across 45 charges")).toBeInTheDocument();
    expect(chargeCalls()[0]!.query).toMatchObject({ offset: 0, limit: 20 });
    const table = within(panel).getByRole("table", { name: "Charges" });
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    expect(within(table).getAllByRole("link", { name: "Circuit" })[0]).toHaveAttribute("href", "/clubs/5");
    expect(within(table).getByText("pay_1003")).toBeInTheDocument();
    expect(within(table).getByText("−₹1,499")).toBeInTheDocument();
    expect(within(panel).getByText(/1–20 of 45 charges/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ offset: 20, limit: 20 }));
    fireEvent.click(within(panel).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ offset: 40 }));
    expect(await within(panel).findByText(/41–45 of 45 charges/)).toBeInTheDocument();
  });

  it("filters by month and by club, from the first page", async () => {
    render(<RevenuePage />);
    const panel = await screen.findByRole("region", { name: "Charges" });
    await within(panel).findByText("₹85,927 across 45 charges");
    fireEvent.click(within(panel).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ offset: 20 }));

    const month = within(panel).getByRole("combobox", { name: "Month" });
    expect(within(month).getByRole("option", { name: "Sep 2026" })).toBeInTheDocument();
    fireEvent.change(month, { target: { value: "2026-09" } });
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ offset: 0, month: "2026-09" }));
    expect(await within(panel).findByText("₹85,927 across 45 charges matching the filters")).toBeInTheDocument();

    fireEvent.change(within(panel).getByRole("searchbox", { name: "Club" }), { target: { value: "Circ" } });
    fireEvent.click(await within(panel).findByRole("button", { name: /Circuit/ }));
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ offset: 0, month: "2026-09", club_id: 5 }));
    fireEvent.click(within(panel).getByRole("button", { name: "Clear club: Circuit" }));
    await waitFor(() => expect(chargeCalls().at(-1)!.query).toMatchObject({ club_id: undefined }));
  });
});

describe("sync from Razorpay", () => {
  it("backfills and says what it found, for the money role only", async () => {
    const success = vi.spyOn(toast, "success");
    render(<RevenuePage />);
    await screen.findByRole("group", { name: "MRR" });
    const before = gets.filter((g) => g.path === "/api/v1/admin/revenue").length;
    fireEvent.click(screen.getByRole("button", { name: /Sync from Razorpay/ }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/revenue/backfill"]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Synced from Razorpay: 120 subscriptions checked, 3 payments added"));
    // The page reads again what the sync may have added.
    await waitFor(() => expect(gets.filter((g) => g.path === "/api/v1/admin/revenue").length).toBeGreaterThan(before));
    success.mockRestore();
  });

  it("is not offered to support or a viewer", async () => {
    for (const r of ["support", "viewer"]) {
      role = r;
      const { unmount } = render(<RevenuePage />);
      await screen.findByRole("group", { name: "MRR" });
      expect(screen.queryByRole("button", { name: /Sync from Razorpay/ })).not.toBeInTheDocument();
      unmount();
    }
    expect(posts).toHaveLength(0);
  });
});

describe("the overview's revenue strip", () => {
  it("shows MRR, paying clubs and this month, and leads to Revenue", async () => {
    render(<RevenueStrip />);
    const link = await screen.findByRole("link", { name: "Plan revenue: open Revenue" });
    expect(link).toHaveAttribute("href", "/revenue");
    expect(link).toHaveTextContent("₹1,23,45,678MRR");
    expect(link).toHaveTextContent("18Paying clubs");
    expect(link).toHaveTextContent("₹14,980Collected this month");
  });

  it("says nothing when the figures cannot be had", async () => {
    failRevenue = true;
    const { container } = render(<RevenueStrip />);
    await waitFor(() => expect(gets.some((g) => g.path === "/api/v1/admin/revenue")).toBe(true));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
