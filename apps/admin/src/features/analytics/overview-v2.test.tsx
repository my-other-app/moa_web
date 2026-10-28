import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { formatCurrency } from "@moa/app-kit";

import doorsFixture from "../__fixtures__/platform-doors.json";

/**
 * The live Overview (`/`), which reads the whole screen from one
 * `GET /admin/overview` response. What can go wrong here is mostly silent:
 * a period control that moves the chart but not the headline beside it, a
 * share computed against the wrong denominator, a re-rank that blanks the
 * card. None of that throws, so each figure is checked against its inputs.
 */
type Query = { days?: number; top_by?: string };
const calls: Array<{ path: string; query?: Query }> = [];
let failNext: string | null = null;
let rerank: Promise<unknown> | null = null;
/** The platform's request figures (confirm each registration); null: a server that doesn't send them. */
let requestsBlock: Record<string, unknown> | null = null;

const TRENDS: Record<number, unknown> = {
  30: {
    days: 30,
    series: [
      { date: "2026-09-26", users: 4, events: 1, registrations: 9, revenue: 500 },
      { date: "2026-10-25", users: 6, events: 0, registrations: 12, revenue: 900 },
    ],
    // users +20%, events flat, registrations +50%, revenue +100%.
    totals: { users: 120, events: 10, registrations: 300, revenue: 50_000 },
    previous_totals: { users: 100, events: 10, registrations: 200, revenue: 25_000 },
  },
  7: {
    days: 7,
    series: [{ date: "2026-10-19", users: 1, events: 0, registrations: 3, revenue: 0 }],
    // users -50%, events flat, registrations -20%, revenue -75%.
    totals: { users: 10, events: 1, registrations: 20, revenue: 1000 },
    previous_totals: { users: 20, events: 1, registrations: 25, revenue: 4000 },
  },
};

const CLUBS = {
  followers: [
    { id: 4, name: "Chess Club", organisation: "CET", followers: 900, registrations: 40, revenue: 0 },
    { id: 7, name: "Robotics", organisation: null, followers: 300, registrations: 120, revenue: 250_000 },
  ],
  registrations: [
    { id: 7, name: "Robotics", organisation: null, followers: 300, registrations: 120, revenue: 250_000 },
    { id: 4, name: "Chess Club", organisation: "CET", followers: 900, registrations: 40, revenue: 0 },
  ],
} as const;

function overview(days = 30, topBy: keyof typeof CLUBS = "followers") {
  return {
    generated_at: "2026-10-25T09:00:00+05:30",
    period_days: days,
    totals: {
      users: 669, clubs: 50, verified_clubs: 38, pending_clubs: 12, organisations: 9,
      events: 42, upcoming_events: 7, past_events: 35, registrations: 1200, attended: 700,
      attendance_rate: 58.3, gmv: 250_000,
    },
    today: { events_today: 2, registrations: 31, check_ins: 18, collected: 4500, new_users: 12 },
    running: [
      { id: 9, name: "Hack Night", club: "Chess Club", event_datetime: "2026-10-25T18:00:00+05:30", registrations: 25, has_fee: false, reg_fee: 0, is_today: true },
      { id: 11, name: "Paid Workshop", club: null, event_datetime: "2026-10-28T10:00:00+05:30", registrations: 8, has_fee: true, reg_fee: 199, is_today: false },
    ],
    averages: {
      registrations_per_event: 29, attendance_rate: 58.3, view_to_signup: 12.5, average_ticket_price: 199,
      revenue_per_paid_event: 9000, followers_per_club: 300, events_per_club: 4, average_rating: 4.6, page_views: 90_000,
    },
    growth: {
      users: [
        { month: "2026-08-15", value: 40 },
        { month: "2026-09-15", value: 55 },
        { month: "2026-10-15", value: 21 },
      ],
      clubs: [{ month: "2026-10-15", value: 38 }],
      events: [{ month: "2026-10-15", value: 6 }],
      gmv: [{ month: "2026-10-15", value: 150_000 }],
    },
    breakdowns: {
      events_by_type: [{ label: "workshop", value: 20 }, { label: "hackathon", value: 22 }],
      clubs_by_organisation: [{ label: "CET", value: 30 }],
      users_by_provider: [{ label: "google", value: 600 }, { label: "apple", value: 69 }],
    },
    funnel: [
      { label: "Viewed an event", value: 9000, of_previous: null },
      { label: "Registered", value: 1200, of_previous: 13.3 },
      { label: "Turned up", value: 700, of_previous: 58.3 },
    ],
    top_clubs: CLUBS[topBy],
    trends: TRENDS[days],
    money: { captured: 100_000, refunded: 20_000, net: 80_000, failed: 3, retained_share: 80, previous_captured: 90_000 },
    ...(requestsBlock ? { requests: requestsBlock } : {}),
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Query }) => {
        calls.push({ path, query: init?.query });
        if (path === "/api/v1/admin/doors") return doorsFixture;
        if (path === "/api/v1/admin/overview") {
          if (failNext) {
            const message = failNext;
            failNext = null;
            throw new Error(message);
          }
          const topBy = (init?.query?.top_by ?? "followers") as keyof typeof CLUBS;
          if (topBy === "registrations" && rerank) await rerank;
          return overview(Number(init?.query?.days ?? 30), topBy);
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});
// Its own figures are covered in revenue.test.tsx; here it would only add a request.
vi.mock("@/features/revenue", () => ({ RevenueStrip: () => null }));

const { render } = await import("@/test/render");
const { AdminOverviewV2 } = await import("./components/overview-v2");
const { toast } = await import("@moa/ui");

/** jsdom's Blob has no text(); FileReader reads it the way a browser would. */
const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
const overviewCalls = () => calls.filter((c) => c.path === "/api/v1/admin/overview");
/** The panel whose title is `title`: the sheet the title row sits in. */
const panel = (title: string) => screen.getByText(title).closest<HTMLElement>(".shadow-card")!;
/** One figure in the hero band, by its label. */
const bandStat = (label: string) =>
  screen.getByText(label, { selector: "span.text-white\\/75" }).parentElement!;
/** A KPI card, which is also the chart's series selector. */
const kpi = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}.*vs previous`) });
/** The Overview loaded, switched to the Pitch view. */
const inPitchView = async () => {
  await screen.findByRole("heading", { name: "Is the platform healthy?" });
  fireEvent.click(screen.getByRole("button", { name: "Pitch view" }));
  await screen.findByRole("heading", { name: "MyOtherApp in numbers" });
};

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  rerank = null;
  requestsBlock = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Overview's one request", () => {
  it("asks once, for the default 30 days with clubs ranked by followers", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });
    expect(overviewCalls()).toEqual([
      { path: "/api/v1/admin/overview", query: { days: 30, top_by: "followers" } },
    ]);
  });

  it("says what failed and loads again on Try again", async () => {
    failNext = "Service Unavailable";
    render(<AdminOverviewV2 />);
    expect(await screen.findByText("Couldn't load this section")).toBeInTheDocument();
    expect(screen.getByText("GET /admin/overview → Service Unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Is the platform healthy?" })).toBeInTheDocument();
    expect(overviewCalls()).toHaveLength(2);
  });
});

describe("the headline band", () => {
  it("answers with every total and its note", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();

    expect(within(bandStat("Users")).getByText("669")).toBeInTheDocument();
    expect(within(bandStat("Users")).getByText("12 today")).toBeInTheDocument();
    expect(within(bandStat("Clubs")).getByText("50")).toBeInTheDocument();
    expect(within(bandStat("Clubs")).getByText("38 verified")).toBeInTheDocument();
    expect(within(bandStat("Organisations")).getByText("9")).toBeInTheDocument();
    expect(within(bandStat("Events hosted")).getByText("7 upcoming")).toBeInTheDocument();
    expect(within(bandStat("Registrations")).getByText("58.3% turned up")).toBeInTheDocument();
    // Compact Indian currency: 2,50,000 is 2.5 lakh.
    expect(within(bandStat("GMV, all time")).getByText("₹2.5L")).toBeInTheDocument();
  });

  it("shows today's activity and what is running this week", async () => {
    render(<AdminOverviewV2 />);
    const today = (await screen.findByText("events on today")).closest<HTMLElement>(".shadow-card")!;
    expect(within(today).getByText("2 on today")).toBeInTheDocument();
    expect(within(today).getByText("check-ins").previousSibling).toHaveTextContent("18");
    expect(within(today).getByText("collected").previousSibling).toHaveTextContent(formatCurrency(4500));

    const hack = within(today).getByRole("link", { name: /Hack Night/ });
    expect(hack).toHaveAttribute("href", "/events/9");
    const hackRow = hack.parentElement!;
    expect(within(hackRow).getByText("Today")).toBeInTheDocument();
    expect(within(hackRow).getByText("25 regs")).toBeInTheDocument();
    expect(within(hackRow).getByText("Free")).toBeInTheDocument();

    const paidRow = within(today).getByRole("link", { name: /Paid Workshop/ }).parentElement!;
    expect(within(paidRow).getByText(formatCurrency(199))).toBeInTheDocument();
    expect(within(paidRow).getByText("—")).toBeInTheDocument();
  });
});

describe("the period", () => {
  it("colours each KPI's change by its direction against the previous window", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });

    expect(within(kpi("New users")).getByText("+20%")).toHaveClass("text-admit");
    expect(within(kpi("Events hosted")).getByText("flat")).toHaveClass("text-ink-2");
    expect(within(kpi("Registrations")).getByText("+50%")).toBeInTheDocument();
    expect(within(kpi("Captured revenue")).getByText("+100%")).toBeInTheDocument();
    expect(within(kpi("New users")).getByText("vs previous 30 days")).toBeInTheDocument();
  });

  it("moves every panel to the same window when the period changes", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() =>
      expect(overviewCalls().at(-1)!.query).toEqual({ days: 7, top_by: "followers" })
    );
    // 10 new users against 20: the headline has to follow the control, not
    // keep showing the 30-day figure beside a 7-day chart.
    expect(await within(kpi("New users")).findByText("-50%")).toHaveClass("text-refuse");
    expect(within(kpi("Captured revenue")).getByText("-75%")).toBeInTheDocument();
    expect(screen.getAllByText("vs previous 7 days")).toHaveLength(4);
    expect(screen.queryByText("vs previous 30 days")).not.toBeInTheDocument();
    expect(within(panel("Revenue retained")).getByText("last 7 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("charts the series picked on its KPI card", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });
    expect(screen.getByRole("img", { name: "users per day, against the previous period" })).toBeInTheDocument();
    expect(kpi("New users")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(kpi("Captured revenue"));
    expect(kpi("Captured revenue")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Captured revenue per day")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "revenue per day, against the previous period" })).toBeInTheDocument();
  });
});

describe("the panels", () => {
  it("lists the averages", async () => {
    render(<AdminOverviewV2 />);
    const averages = (await screen.findByText("Averages")).closest<HTMLElement>(".shadow-card")!;
    const value = (label: string) => within(averages).getByText(label).nextSibling;
    expect(value("Registrations per event")).toHaveTextContent("29");
    expect(value("Attendance rate")).toHaveTextContent("58.3%");
    expect(value("View → sign-up")).toHaveTextContent("12.5%");
    expect(value("Average ticket price")).toHaveTextContent(formatCurrency(199));
    expect(value("Events per club")).toHaveTextContent("4");
    expect(value("Event rating")).toHaveTextContent("4.6 ★");
  });

  it("draws growth by month, with the current month lit", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();
    const growth = (await screen.findByText("Growth by month")).closest<HTMLElement>(".shadow-card")!;
    const users = within(growth).getByText("Users").parentElement!;
    for (const month of ["Aug", "Oct"]) expect(within(users).getByText(month)).toBeInTheDocument();
    const bar = (value: string) => within(users).getByText(value).nextSibling as HTMLElement;
    expect(bar("21")).toHaveClass("bg-brand");
    expect(bar("55")).toHaveClass("bg-brand/45");
    // Money in compact rupees, beside the plain counts.
    expect(within(within(growth).getByText("GMV per month").parentElement!).getByText("₹1.5L")).toBeInTheDocument();
  });

  it("follows discovery to the door, each stage as a share of the one before", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();
    const funnel = (await screen.findByText("From discovery to the door")).closest<HTMLElement>(".shadow-card")!;
    const stage = (label: string) => within(funnel).getByText(label).nextSibling as HTMLElement;
    expect(stage("Viewed an event")).toHaveTextContent(/^9,000$/);
    expect(stage("Registered")).toHaveTextContent("1,20013.3%");
    expect(stage("Turned up")).toHaveTextContent("70058.3%");
  });

  it("splits the breakdowns by type, organisation and sign-in provider", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();
    expect(within(panel("Events by type")).getByText("42 events")).toBeInTheDocument();
    expect(within(panel("Events by type")).getByText("hackathon")).toBeInTheDocument();
    expect(within(panel("Clubs by organisation")).getByText("50 clubs")).toBeInTheDocument();
    const providers = panel("How users sign in");
    expect(within(providers).getByText("669 users")).toBeInTheDocument();
    expect(within(providers).getByText("google").nextSibling).toHaveTextContent("600");
  });

  it("shows revenue retained as a share of what was captured", async () => {
    render(<AdminOverviewV2 />);
    const retained = (await screen.findByText("Revenue retained")).closest<HTMLElement>(".shadow-card")!;
    expect(within(retained).getByText("80%")).toBeInTheDocument();
    const row = (label: string) => within(retained).getByText(label).nextSibling;
    expect(row("Captured")).toHaveTextContent(formatCurrency(100_000));
    expect(row("Refunded")).toHaveTextContent(`−${formatCurrency(20_000)}`);
    expect(row("Net kept")).toHaveTextContent(formatCurrency(80_000));
    expect(row("Failed payments")).toHaveTextContent("3");
  });

  it("derives the platform's composition from its two halves", async () => {
    render(<AdminOverviewV2 />);
    const composition = (await screen.findByText("Platform composition")).closest<HTMLElement>(".shadow-card")!;
    // 38 verified, 12 waiting: 76% / 24%. 7 upcoming, 35 past: 17% / 83%.
    expect(within(composition).getByText("Verified clubs").parentElement).toHaveTextContent("Verified clubs 76%");
    expect(within(composition).getByText("Awaiting 24%")).toBeInTheDocument();
    expect(within(composition).getByText("Upcoming events").parentElement).toHaveTextContent("Upcoming events 17%");
    expect(within(composition).getByText("Past 83%")).toBeInTheDocument();
    expect(within(composition).getByRole("link", { name: /Club subscriptions/ })).toHaveAttribute("href", "/subscriptions");
  });

  it("re-ranks the top clubs without blanking the card while it asks", async () => {
    let release!: () => void;
    rerank = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(<AdminOverviewV2 />);
    const top = (await screen.findByText("Top clubs")).closest<HTMLElement>(".shadow-card")!;
    const names = () => within(top).getAllByRole("link").map((a) => a.textContent);
    expect(names()).toEqual(["Chess ClubCET", "Robotics—"]);

    fireEvent.click(within(top).getByRole("button", { name: "Registrations" }));
    await waitFor(() =>
      expect(overviewCalls().at(-1)!.query).toEqual({ days: 30, top_by: "registrations" })
    );
    // Still the previous ranking, not a skeleton, until the answer lands.
    expect(names()).toEqual(["Chess ClubCET", "Robotics—"]);

    release();
    await waitFor(() => expect(names()).toEqual(["Robotics—", "Chess ClubCET"]));
    expect(within(top).getByRole("link", { name: /Robotics/ })).toHaveAttribute("href", "/clubs/7");
    expect(within(top).getAllByText("₹2.5L")).toHaveLength(1);
  });

  it("carries the platform's doors", async () => {
    render(<AdminOverviewV2 />);
    expect(await screen.findByText("Doors open now")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/admin/doors")).toBe(true);
  });
});

describe("taking the figures away", () => {
  it("copies a plain-text snapshot of the headline totals", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const said = vi.spyOn(toast, "success");
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });

    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.split("\n")).toEqual([
      "MyOtherApp — platform snapshot",
      "• Users: 669",
      "• Clubs: 50 (38 verified)",
      "• Organisations: 9",
      "• Events hosted: 42",
      "• Registrations: 1,200",
      "• Attendance rate: 58.3%",
      `• GMV all time: ${formatCurrency(250_000)}`,
      "• Average rating: 4.6 from ratings",
    ]);
    expect(said).toHaveBeenCalledWith("Summary copied");
  });

  it("exports the same totals as a CSV file", async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:snapshot";
    });
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(downloaded).toBe("platform-snapshot.csv");
    const csv = (await readText(blob!)).replace(/^\uFEFF/, "");
    expect(csv.split("\n").slice(0, 3)).toEqual(["metric,value", '"Users","669"', '"Clubs","50 (38 verified)"']);
  });

});

describe("the two views", () => {
  /** Panels the Operations view is for: what needs doing, today. */
  const operations = ["Doors open now", "events on today", "Averages", "Revenue retained", "Platform composition"];
  /** Panels the Pitch view is for: the growth story, for someone outside. */
  const pitch = ["Growth by month", "From discovery to the door", "Events by type", "Clubs by organisation", "How users sign in"];
  const shown = (text: string) => screen.queryByText(text) !== null;

  it("opens on Operations: the queues and today, not the pitch", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByText("Doors open now");
    expect(screen.getByRole("button", { name: "Operations" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pitch view" })).toHaveAttribute("aria-pressed", "false");
    for (const text of operations) expect(shown(text), text).toBe(true);
    for (const text of pitch) expect(shown(text), text).toBe(false);
    // No headline band: its totals are read in the panels here.
    expect(screen.queryByText("GMV, all time")).toBeNull();
  });

  it("Pitch view shows the headline growth numbers and none of the internal queues", async () => {
    render(<AdminOverviewV2 />);
    await inPitchView();
    expect(screen.getByRole("button", { name: "Pitch view" })).toHaveAttribute("aria-pressed", "true");
    expect(within(bandStat("Users")).getByText("669")).toBeInTheDocument();
    expect(within(bandStat("GMV, all time")).getByText("₹2.5L")).toBeInTheDocument();
    for (const text of pitch) expect(shown(text), text).toBe(true);
    for (const text of operations) expect(shown(text), text).toBe(false);
    // What runs today, refunds and failed payments, clubs awaiting a check: not for a slide.
    expect(screen.queryByRole("link", { name: /Hack Night/ })).toBeNull();
    expect(screen.queryByText("Failed payments")).toBeNull();
    expect(screen.queryByText(/^Awaiting/)).toBeNull();
    // The trend and the top clubs are in both.
    expect(kpi("New users")).toBeInTheDocument();
    expect(screen.getByText("Top clubs")).toBeInTheDocument();
  });

  it("goes back to Operations, with the period kept and nothing asked again", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(overviewCalls().at(-1)!.query).toEqual({ days: 7, top_by: "followers" }));
    await within(kpi("New users")).findByText("-50%");
    const asked = overviewCalls().length;

    fireEvent.click(screen.getByRole("button", { name: "Pitch view" }));
    await screen.findByText("Growth by month");
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    expect(await screen.findByRole("heading", { name: "Is the platform healthy?" })).toBeInTheDocument();
    for (const text of operations) expect(shown(text), text).toBe(true);
    expect(within(panel("Revenue retained")).getByText("last 7 days")).toBeInTheDocument();
    // One response, two views of it: switching asks for nothing.
    expect(overviewCalls()).toHaveLength(asked);
  });

  it("copies the same snapshot from either view", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<AdminOverviewV2 />);
    await inPitchView();
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.split("\n")[1]).toBe("• Users: 669");
  });
});

describe("the platform's request figures", () => {
  it("shows registrations reviewed: received, under review, and the average time to review", async () => {
    requestsBlock = { received: 1840, waiting: 96, avg_decision_hours: 20.5 };
    render(<AdminOverviewV2 />);
    const requests = await screen.findByLabelText("Registrations reviewed");
    expect(requests).toHaveTextContent("Registrations reviewed");
    expect(requests).toHaveTextContent("received1,840");
    expect(requests).toHaveTextContent("under review96");
    expect(requests).toHaveTextContent("average time to review21 h");
    expect(requests).not.toHaveTextContent(/waiting|request/i);
  });

  it("reads the other names a server may use, and a long wait in days", async () => {
    requestsBlock = { total: 12, pending: 3, avg_decision_hours: 72 };
    render(<AdminOverviewV2 />);
    const requests = await screen.findByLabelText("Registrations reviewed");
    expect(requests).toHaveTextContent("received12");
    expect(requests).toHaveTextContent("under review3");
    expect(requests).toHaveTextContent("average time to review3 d");
  });

  it("is not there when the server doesn't send them", async () => {
    render(<AdminOverviewV2 />);
    await screen.findByRole("heading", { name: "Is the platform healthy?" });
    expect(screen.queryByLabelText("Registrations reviewed")).toBeNull();
  });
});
