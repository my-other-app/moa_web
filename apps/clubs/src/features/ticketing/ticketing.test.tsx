import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * The club's ticketing screens, against the API of docs/TICKETING.md §8:
 * sales by ticket type on the event's overview and its Tickets tab, the
 * discount codes (the club's page and an event's), and the waiting list --
 * and none of it, nothing failing and nothing spinning, against a backend
 * from before ticket types (every route answers FastAPI's bare 404).
 */
type Call = { method: string; path: string; body?: unknown; query?: unknown };
const calls: Call[] = [];
let server: "old" | "new" = "new";
/** Per-path answers that win: an Error is thrown. */
let override: Record<string, unknown> = {};
const pathname = { current: "/events/37" };

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => pathname.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

const missing = () => toApiError(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } }));

const TYPES = {
  types: [
    { id: 11, name: "General", description: null, price: 250, capacity: 80, sales_start: null, sales_end: null, is_hidden: false, per_person_limit: null, sort_order: 0, is_default: true, sold: 12, available: 68, waiting: 0, offered: 0, has_registrations: true },
    { id: 12, name: "Student", description: null, price: 99, capacity: 20, sales_start: null, sales_end: null, is_hidden: false, per_person_limit: 1, sort_order: 1, is_default: false, sold: 20, available: 0, waiting: 3, offered: 1, has_registrations: true },
  ],
  follows_event: false,
  event_capacity: 100,
  event_available: 68,
  max_types: 5,
};

const SALES = {
  types: [
    { id: 11, name: "General", price: 250, capacity: 80, is_hidden: false, sold: 12, paid: 12, revenue: 2800, pending: 4, discount_total: 200, available: 68, waiting: 0, offered: 0 },
    { id: 12, name: "Student", price: 99, capacity: 20, is_hidden: false, sold: 20, paid: 18, revenue: 1782, pending: 0, discount_total: 0, available: 0, waiting: 3, offered: 1 },
  ],
  totals: { sold: 32, paid: 30, revenue: 4582, pending: 4, discount_total: 200, waiting: 3, offered: 1 },
  codes: [{ id: 5, code: "EARLY20", uses: 4, discount_total: 200 }],
  event_capacity: 100,
  event_available: 68,
  waitlist_enabled: true,
};

const ONE_TYPE_SALES = {
  ...SALES,
  types: [{ ...SALES.types[0]!, discount_total: 0 }],
  codes: [],
  waitlist_enabled: false,
};

const code = (over: Record<string, unknown> = {}) => ({
  id: 5, code: "EARLY20", kind: "percent", value: 20, event_id: 37, event_name: "SF Sea Hackathon", ticket_type_ids: null, starts_at: null, ends_at: "2026-11-01T23:59:00+05:30",
  max_uses: 50, per_person_limit: 1, is_active: true, uses: 4, discount_total: 200, status: "active", created_at: "2026-10-20T10:00:00+05:30", ...over,
});
const CODES = [code(), code({ id: 6, code: "MEMBERS", kind: "amount", value: 100, event_id: null, event_name: null, max_uses: null, per_person_limit: null, ends_at: null, uses: 9, discount_total: 900, status: "active" }), code({ id: 7, code: "LAUNCH", status: "used_up", uses: 50 })];

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1", ticket_type_id: 12, ticket_type_name: "Student", full_name: "Asha K", email: "asha@example.com", phone: "9876543210", user_id: null, whatsapp_opt_in: true,
  status: "waiting", position: 1, offered_at: null, offer_expires_at: null, offers_made: 0, registration_id: null, created_at: "2026-10-24T10:00:00+05:30", closed_at: null, offer_url: null, ...over,
});
const WAITLIST = {
  settings: { enabled: true, offer_hours: 24, allowed: true },
  counts: { waiting: 2, offered: 1, claimed: 0, expired: 0, removed: 0, left: 0 },
  entries: [
    entry({ id: "e0", full_name: "Ravi M", status: "offered", position: null, offer_expires_at: "2026-10-26T10:00:00+05:30", offer_url: "https://myotherapp.in/claim/tok123", offers_made: 1 }),
    entry(),
    entry({ id: "e2", full_name: "Meera S", position: 2, whatsapp_opt_in: false, phone: null }),
  ],
  total: 3,
};

const ENTITLEMENTS = (features: Record<string, boolean>, limits: Record<string, number | null> = {}) => ({
  plan_key: "free", plan_name: "Free", status: "active", cycle: "monthly", current_period_end: null, limits, features, configured: true,
  requested_plan: null, requested_cycle: null, subscription_status: null, usage: {}, enforced: true, grandfathered_before: null,
});

const NEW: Record<string, unknown> = {
  "/api/v1/events/37/ticketing/types": TYPES,
  "/api/v1/events/37/ticketing/sales": SALES,
  "/api/v1/clubs/discount-codes": CODES,
  "/api/v1/events/37/ticketing/codes": [CODES[0], CODES[1]],
  "/api/v1/events/37/ticketing/waitlist": WAITLIST,
};

const TICKETING = /^\/api\/v1\/(events\/\d+\/ticketing|clubs\/discount-codes)/;

async function answer(path: string) {
  if (path in override) {
    const a = override[path];
    if (a instanceof Error) throw a;
    return a;
  }
  if (TICKETING.test(path)) {
    if (server === "old") throw await missing();
    if (path in NEW) return NEW[path];
  }
  if (path.includes("/events/info/")) return eventFixture;
  if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
  if (path === "/api/v1/clubs/events/list") return { items: [{ ...eventFixture, id: 37 }], total: 1, limit: 100, offset: 0 };
  throw new Error(`unstubbed GET ${path}`);
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: unknown }) => {
        calls.push({ method: "GET", path, query: options?.query });
        return answer(path);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path in override) {
          const a = override[path];
          if (a instanceof Error) throw a;
          return a;
        }
        if (path === "/api/v1/clubs/discount-codes") return code({ id: 9, code: (body as { code: string }).code, event_id: (body as { event_id: number | null }).event_id });
        if (path.endsWith("/offer")) return entry({ status: "offered" });
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path.endsWith("/waitlist/settings")) return { ...WAITLIST.settings, ...(body as object) };
        throw new Error(`unstubbed PUT ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return code({ ...(body as object) });
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return {};
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { TicketSalesCard, TicketsPage, DiscountCodesPage, DiscountCodesPanel, WaitlistPanel, codeFormSchema, codeValueText, usesText, normaliseCode, salesWorthShowing, salesSchema, ticketingError } = await import("./index");
const { EventConsole } = await import("@/features/console");
const { SidebarNav } = await import("@/components/sidebar-nav");

beforeEach(() => {
  calls.length = 0;
  server = "new";
  override = {};
  pathname.current = "/events/37";
});

const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe("the words and the forms", () => {
  it("says what a code takes off and how much of it is used", () => {
    expect(codeValueText({ kind: "percent", value: 20 })).toBe("20% off");
    expect(codeValueText({ kind: "percent", value: 12.5 })).toBe("12.5% off");
    expect(codeValueText({ kind: "amount", value: 100 })).toBe("₹100 off");
    expect(usesText({ uses: 4, max_uses: 50 })).toBe("4 of 50");
    expect(usesText({ uses: 1200, max_uses: null })).toBe("1,200 used");
    expect(normaliseCode(" early bird 20 ")).toBe("EARLYBIRD20");
    // The server's refusals in the club's words; anything else in the server's own.
    expect(ticketingError(new ApiError({ message: "No place is free.", status: 409, errorCode: "WAITLIST_NO_ROOM" }))).toMatch(/Raise the type's places/);
    expect(ticketingError(new ApiError({ message: "Something else.", status: 409, errorCode: "OTHER" }))).toBe("Something else.");
  });

  it("checks a code before it is sent", () => {
    const ok = codeFormSchema.parse({ code: "early20", kind: "percent", value: "20", event_id: "", max_uses: "", per_person_limit: "2" });
    expect(ok).toMatchObject({ code: "EARLY20", value: 20, max_uses: undefined, per_person_limit: 2, is_active: true });
    const issues = (input: Record<string, unknown>) => codeFormSchema.safeParse(input).error?.issues.map((i) => i.path[0]);
    expect(issues({ code: "ab", kind: "percent", value: 10 })).toEqual(["code"]);
    expect(issues({ code: "WAYTOOMUCH", kind: "percent", value: 120 })).toEqual(["value"]);
    expect(issues({ code: "NOTHING", kind: "amount", value: "" })).toEqual(["value"]);
    expect(issues({ code: "BACKWARDS", kind: "amount", value: 50, starts_at: "2026-11-02T10:00", ends_at: "2026-11-01T10:00" })).toEqual(["ends_at"]);
  });

  it("shows tickets on the overview only when there is more than one kind of ticket to read", () => {
    expect(salesWorthShowing(salesSchema.parse(SALES))).toBe(true);
    expect(salesWorthShowing(salesSchema.parse(ONE_TYPE_SALES))).toBe(false);
    expect(salesWorthShowing(salesSchema.parse({ ...ONE_TYPE_SALES, codes: [{ id: 1, code: "X", uses: 1, discount_total: 5 }] }))).toBe(true);
  });
});

describe("sales by ticket type", () => {
  it("on the overview: each type's sold, money, unpaid, left and line, the totals and the codes", async () => {
    render(<TicketSalesCard eventId={37} />);
    const table = await screen.findByRole("table", { name: "Sales by ticket type" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("General");
    expect(rows[1]).toHaveTextContent("12 of 80 sold");
    expect(rows[1]).toHaveTextContent("₹2,800");
    expect(rows[2]).toHaveTextContent("20 of 20 sold");
    expect(rows[2]).toHaveTextContent("3 · 1 offered");
    expect(rows[3]).toHaveTextContent("32 of 100 sold");
    expect(rows[3]).toHaveTextContent("₹4,582");
    expect(screen.getByText("EARLY20")).toBeInTheDocument();
    expect(screen.getByText(/4 uses · ₹200 off/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/events/37/tickets");
  });

  it("stays off a single-type event's overview, and off a backend without types", async () => {
    override["/api/v1/events/37/ticketing/sales"] = ONE_TYPE_SALES;
    const { unmount } = render(<TicketSalesCard eventId={37} />);
    await waitFor(() => expect(sent("GET", "/api/v1/events/37/ticketing/sales")).toHaveLength(1));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    unmount();
    override = {};
    server = "old";
    render(<TicketSalesCard eventId={37} />);
    await waitFor(() => expect(sent("GET", "/api/v1/events/37/ticketing/sales").length).toBeGreaterThan(1));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("the event's Tickets tab", () => {
  it("is in the console's rail once the API has ticket types", async () => {
    render(
      <EventConsole eventId={37}>
        <p>page</p>
      </EventConsole>,
    );
    expect(await screen.findByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/events/37/tickets");
  });

  it("is not, on a backend without them", async () => {
    server = "old";
    render(
      <EventConsole eventId={37}>
        <p>page</p>
      </EventConsole>,
    );
    expect(await screen.findByRole("link", { name: "Attendees" })).toBeInTheDocument();
    await waitFor(() => expect(sent("GET", "/api/v1/events/37/ticketing/types")).toHaveLength(1));
    expect(screen.queryByRole("link", { name: "Tickets" })).not.toBeInTheDocument();
  });

  it("puts the types, the sales, the line and the event's codes together", async () => {
    render(<TicketsPage eventId={37} />);
    expect(await screen.findByRole("heading", { name: "2 ticket types" })).toBeInTheDocument();
    expect(screen.getByText(/General · ₹250 · 12 of 80 sold/)).toBeInTheDocument();
    expect(screen.getByText(/100 places across all types/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit ticket types/ })).toHaveAttribute("href", "/events/37/edit#section-entry");
    expect(await screen.findByRole("table", { name: "Sales by ticket type" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "People on the waiting list" })).toBeInTheDocument();
    expect(await screen.findByText("This event's discount codes")).toBeInTheDocument();
  });

  it("says ticket types aren't there yet, on a backend without them", async () => {
    server = "old";
    render(<TicketsPage eventId={37} />);
    expect(await screen.findByText("Ticket types aren't available yet")).toBeInTheDocument();
  });
});

describe("discount codes", () => {
  it("lists every code with what it takes off, where it works, its window and its uses", async () => {
    render(<DiscountCodesPage />);
    const list = await screen.findByRole("list", { name: "Discount codes" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("EARLY20");
    expect(rows[0]).toHaveTextContent("20% off · SF Sea Hackathon");
    expect(rows[0]).toHaveTextContent("4 of 50");
    expect(rows[0]).toHaveTextContent("1 per person");
    expect(rows[0]).toHaveTextContent("₹200 given");
    expect(rows[1]).toHaveTextContent("₹100 off · Every event");
    expect(rows[1]).toHaveTextContent("Any time");
    expect(rows[2]).toHaveTextContent("Used up");
  });

  it("makes a code for every event of the club", async () => {
    render(<DiscountCodesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New code/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "members 2026" } });
    expect(within(dialog).getByLabelText("Code")).toHaveValue("MEMBERS2026");
    fireEvent.click(within(dialog).getByRole("radio", { name: "An amount" }));
    fireEvent.change(within(dialog).getByLabelText("Rupees off"), { target: { value: "150" } });
    fireEvent.change(within(dialog).getByLabelText(/Uses in all/), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make code" }));
    await waitFor(() => expect(sent("POST", "/api/v1/clubs/discount-codes")).toHaveLength(1));
    expect(sent("POST", "/api/v1/clubs/discount-codes")[0]!.body).toEqual({
      code: "MEMBERS2026", event_id: null, kind: "amount", value: 150, ticket_type_ids: null, starts_at: null, ends_at: null, max_uses: 100, per_person_limit: null, is_active: true,
    });
  });

  it("says what is wrong before sending a code", async () => {
    render(<DiscountCodesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New code/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "AB" } });
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "150" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make code" }));
    expect(await within(dialog).findByText("At least 3 letters or digits")).toBeInTheDocument();
    expect(within(dialog).getByText("At most 100%")).toBeInTheDocument();
    expect(sent("POST", "/api/v1/clubs/discount-codes")).toHaveLength(0);
  });

  it("on an event: the code is that event's, and can be held to its ticket types", async () => {
    render(<DiscountCodesPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /New code/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Works on")).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "STUDENT10" } });
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "10" } });
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: "Student" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Make code" }));
    await waitFor(() => expect(sent("POST", "/api/v1/clubs/discount-codes")).toHaveLength(1));
    expect(sent("POST", "/api/v1/clubs/discount-codes")[0]!.body).toMatchObject({ code: "STUDENT10", event_id: 37, kind: "percent", value: 10, ticket_type_ids: [12] });
  });

  it("changes a code but never its text, switches it off, and deletes it", async () => {
    render(<DiscountCodesPage />);
    const list = await screen.findByRole("list", { name: "Discount codes" });
    fireEvent.click(within(list).getByRole("button", { name: "Edit EARLY20" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Code")).toBeDisabled();
    expect(within(dialog).getByLabelText("Percent off")).toHaveValue(20);
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save code" }));
    await waitFor(() => expect(sent("PATCH", "/api/v1/clubs/discount-codes/5")).toHaveLength(1));
    const body = sent("PATCH", "/api/v1/clubs/discount-codes/5")[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ kind: "percent", value: 25, max_uses: 50, per_person_limit: 1 });
    expect(body).not.toHaveProperty("code");

    fireEvent.click(within(list).getByRole("switch", { name: "Turn MEMBERS off" }));
    await waitFor(() => expect(sent("PATCH", "/api/v1/clubs/discount-codes/6")).toHaveLength(1));
    expect(sent("PATCH", "/api/v1/clubs/discount-codes/6")[0]!.body).toEqual({ is_active: false });

    fireEvent.click(within(list).getByRole("button", { name: "Delete LAUNCH" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent("DELETE", "/api/v1/clubs/discount-codes/7")).toHaveLength(1));
  });

  it("is a lock when the plan has no codes, and the codes already made stay listed", async () => {
    override["/api/v1/clubs/entitlements"] = ENTITLEMENTS({ coupons: false, tickets: true });
    render(<DiscountCodesPage />);
    expect(await screen.findByRole("list", { name: "Discount codes" })).toBeInTheDocument();
    await waitFor(() => expect(sent("GET", "/api/v1/clubs/entitlements").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: /New code/ }).querySelector("svg.lucide-lock")).not.toBeNull());
  });

  it("is not there at all on a backend without codes", async () => {
    server = "old";
    render(<DiscountCodesPage />);
    expect(await screen.findByText("Discount codes aren't available yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New code/ })).not.toBeInTheDocument();
  });

  it("joins the rail under Grow once the API has codes", async () => {
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /Discount codes/ })).toHaveAttribute("href", "/discount-codes");
  });

  it("stays out of the rail on a backend without them", async () => {
    server = "old";
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await waitFor(() => expect(sent("GET", "/api/v1/clubs/discount-codes")).toHaveLength(1));
    expect(screen.queryByRole("link", { name: /Discount codes/ })).not.toBeInTheDocument();
  });
});

describe("the waiting list", () => {
  it("lists the line in order, with who was offered a place until when", async () => {
    render(<WaitlistPanel eventId={37} />);
    const list = await screen.findByRole("list", { name: "People on the waiting list" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Ravi M");
    expect(rows[0]).toHaveTextContent("Offered");
    expect(rows[0]).toHaveTextContent(/Held until/);
    expect(rows[1]).toHaveTextContent("#1");
    expect(rows[1]).toHaveTextContent("asha@example.com · 9876543210 · WhatsApp");
    expect(rows[2]).toHaveTextContent("#2");
    expect(screen.getByRole("switch", { name: "Waiting list on" })).toBeChecked();
    expect(screen.getByRole("link", { name: /Export/ })).toHaveAttribute("href", "/api/gateway/api/v1/events/37/ticketing/waitlist/export");
    expect(screen.getByRole("button", { name: /Waiting 2/ })).toBeInTheDocument();
  });

  it("copies a standing offer's claim link", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<WaitlistPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy Ravi M's claim link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://myotherapp.in/claim/tok123"));
  });

  it("offers a place by hand, and says so when there is no place free", async () => {
    render(<WaitlistPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Offer Asha K a place" }));
    await waitFor(() => expect(sent("POST", "/api/v1/events/37/ticketing/waitlist/e1/offer")).toHaveLength(1));

    override["/api/v1/events/37/ticketing/waitlist/e2/offer"] = new ApiError({ message: "No place is free.", status: 409, errorCode: "WAITLIST_NO_ROOM" });
    fireEvent.click(screen.getByRole("button", { name: "Offer Meera S a place" }));
    await waitFor(() => expect(sent("POST", "/api/v1/events/37/ticketing/waitlist/e2/offer")).toHaveLength(1));
  });

  it("takes someone off, filters the line, and turns the list off and its hours", async () => {
    render(<WaitlistPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take Meera S off the list" }));
    await waitFor(() => expect(sent("DELETE", "/api/v1/events/37/ticketing/waitlist/e2")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /Offered 1/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/ticketing/waitlist" && (c.query as { status?: string })?.status === "offered")).toBe(true));

    fireEvent.change(screen.getByLabelText("Hours an offer holds a place"), { target: { value: "200" } });
    expect(screen.getByText("1 to 168 hours")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hours an offer holds a place"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("PUT", "/api/v1/events/37/ticketing/waitlist/settings")[0]?.body).toEqual({ offer_hours: 12 }));

    fireEvent.click(screen.getByRole("switch", { name: "Waiting list on" }));
    await waitFor(() => expect(sent("PUT", "/api/v1/events/37/ticketing/waitlist/settings")[1]?.body).toEqual({ enabled: false }));
  });

  it("is not there on a backend without waiting lists", async () => {
    server = "old";
    const { container } = render(<WaitlistPanel eventId={37} />);
    await waitFor(() => expect(sent("GET", "/api/v1/events/37/ticketing/waitlist")).toHaveLength(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
