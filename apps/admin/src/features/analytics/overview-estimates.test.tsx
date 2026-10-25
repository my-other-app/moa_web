import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

/**
 * Past a million rows the Wave-1 Overview counts every account and every
 * registration from the database's own row estimate, and says which in
 * `estimated` (by table). Those figures read "≈"; the rest stay exact, and
 * an API from before -- which sends no `estimated` -- reads as it did.
 */
let estimated: string[] | undefined;

const overview = () => ({
  generated_at: "2026-10-18T09:00:00+00:00",
  period_days: 30,
  ...(estimated ? { estimated } : {}),
  totals: { users: 1_250_000, clubs: 420, verified_clubs: 400, pending_clubs: 20, organisations: 90, events: 3100, upcoming_events: 40, past_events: 3060, registrations: 4_800_000, attended: 2_900_000, attendance_rate: 60.4, gmv: 12_500_000 },
  today: { events_today: 3, registrations: 812, check_ins: 300, collected: 42_000, new_users: 950 },
  running: [],
  averages: { registrations_per_event: 1548, attendance_rate: 60.4, view_to_signup: 12, average_ticket_price: 199, revenue_per_paid_event: 9000, followers_per_club: 300, events_per_club: 7, average_rating: 4.5, page_views: 900_000 },
  growth: { users: [], clubs: [], events: [], gmv: [] },
  breakdowns: { events_by_type: [], clubs_by_organisation: [], users_by_provider: [] },
  funnel: [],
  top_clubs: [],
  trends: { days: 30, series: [], totals: { users: 0, events: 0, registrations: 0, revenue: 0 }, previous_totals: { users: 0, events: 0, registrations: 0, revenue: 0 } },
  money: { captured: 0, refunded: 0, net: 0, failed: 0, retained_share: 0, previous_captured: 0 },
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/admin/overview") return overview();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});
vi.mock("@/features/revenue", () => ({ RevenueStrip: () => null }));
vi.mock("./components/platform-doors-panel", () => ({ PlatformDoorsPanel: () => null }));

const { render } = await import("@/test/render");
const { AdminOverviewV2 } = await import("./components/overview-v2");
const { adminOverviewSchema, approx, estimatedTotals } = await import("./overview-schemas");

beforeEach(() => {
  estimated = undefined;
});

/** The headline band is the Pitch view's. */
const inPitchView = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Pitch view" }));
};

describe("estimated counts on the Overview", () => {
  it("names the totals behind each estimated table, a rate over one included", () => {
    expect([...estimatedTotals(["users"])]).toEqual(["users"]);
    expect([...estimatedTotals(["event_registrations_link"])].sort()).toEqual(["attendance_rate", "registrations"]);
    expect(estimatedTotals(["some_table"]).size).toBe(0);
    expect(approx("12,50,000", true)).toBe("≈ 12,50,000");
    expect(approx("420", false)).toBe("420");
  });

  it("parses today's Overview, which sends no estimated, as all exact", () => {
    expect(adminOverviewSchema.parse(overview()).estimated).toEqual([]);
  });

  it("marks the estimated figures with ≈ and leaves the exact ones alone", async () => {
    estimated = ["users", "event_registrations_link"];
    render(<AdminOverviewV2 />);
    await inPitchView();
    const users = (await screen.findByText("Users", { selector: "span.text-white\\/75" })).parentElement!;
    expect(within(users).getByText(/^≈ [\d,]+$/)).toBeInTheDocument();
    const regs = screen.getByText("Registrations", { selector: "span.text-white\\/75" }).parentElement!;
    expect(within(regs).getByText(/^≈ [\d,]+$/)).toBeInTheDocument();
    expect(within(regs).getByText(/^≈ 60.4% turned up$/)).toBeInTheDocument();
    const clubs = screen.getByText("Clubs", { selector: "span.text-white\\/75" }).parentElement!;
    expect(within(clubs).queryByText(/≈/)).toBeNull();
  });

  it("shows no ≈ at all for an API from before", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();
    await screen.findByText("Users", { selector: "span.text-white\\/75" });
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
