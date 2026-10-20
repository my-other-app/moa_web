import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import summaryFixture from "../__fixtures__/store-summary.json";

/**
 * An event's Merchandise tab: the club's items this event offers (GET
 * /events/{id}/store, with this event's sales and the shared stock left),
 * choosing them (PUT /events/{id}/store/offers), taking one off this event
 * (DELETE /events/{id}/store/{item}), and the orders, with oversold ones
 * settled (POST …/orders/{id}/fulfil) rather than handed over.
 */
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];
const summary = { ...summaryFixture, oversold: 2 };

const variants = [
  { id: "v1", label: "S", stock: 30, sold: 8, held: 0, left: 22 },
  { id: "v2", label: "M", stock: 30, sold: 19, held: 0, left: 11 },
];
// On this event: sold and earned are this event's; left is the club's, shared.
const offered = [
  { id: "i1", name: "Hack Night tee", description: null, photo_key: null, photo_url: "https://cdn.example/tee.png", price: 450, stock: null, sold: 12, held: 0, left: 33, earned: 5400, available_roles: null, free_roles: ["speaker"], on_sale: true, sort_order: 0, variants },
  { id: "i2", name: "ESP32-S3 starter kit", description: null, photo_key: null, photo_url: null, price: 890, stock: 25, sold: 25, held: 0, left: 0, earned: 22250, available_roles: ["attendee", "staff"], free_roles: [], on_sale: true, sort_order: 1, variants: [] },
];
const club = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, description: null, photo_url: null, photo_key: null, price: 80, stock: 100, variants: [], available_roles: null, free_roles: [], on_sale: true, sort_order: 0, sold: 0, held: 0, left: 100, earned: 0, events: [], ...over });
const catalogue = [club("i1", "Hack Night tee", { variants, stock: null, left: 33 }), club("i2", "ESP32-S3 starter kit", { left: 0 }), club("i3", "Club lanyard", { left: 93 })];

const order = (id: string, guest: string, status: string, handed: string | null, summaryText: string) => ({ id, registration_id: `r-${id}`, guest, ticket_id: `T-${id}`, status, total: 450, lines: [], summary: summaryText, paid_at: "2026-10-12T00:00:00+05:30", handed_over_at: handed, created_at: "2026-10-12T00:00:00+05:30" });
const ORDERS = [order("o1", "Aarav Kulkarni", "paid", "2026-10-12T01:00:00+05:30", "Tee (M)"), order("o2", "Rohan Patil", "paid", null, "Tee (L)"), order("o3", "Meera Iyer", "oversold", null, "Kit")];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, o?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: o?.query });
        if (path === "/api/v1/events/37/store/summary") return summary;
        if (path === "/api/v1/events/37/store") return offered;
        if (path === "/api/v1/events/37/store/offers") return { merch_enabled: true, item_ids: ["i1", "i2"] };
        if (path === "/api/v1/clubs/store") return { items: catalogue };
        if (path === "/api/v1/events/37/store/orders") {
          const status = o?.query?.status;
          const items = status ? ORDERS.filter((x) => x.status === status) : ORDERS;
          return { items, total: items.length, page: 1, page_size: 10 };
        }
        if (path.includes("/events/info/")) return { id: 37, name: "Hack Night 04", merch_enabled: true, status: "published", category: { id: 1, name: "Hackathon" } };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/orders/o2/handover")) return { ...ORDERS[1], handed_over_at: "2026-10-12T02:00:00+05:30" };
        if (path.endsWith("/orders/o3/fulfil")) return { ...ORDERS[2], status: "paid" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/settings")) return { merch_enabled: false, swag_enabled: false };
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { merch_enabled: true, item_ids: (body as { item_ids: string[] }).item_ids };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return { deleted: true };
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { StorePage } = await import("./components/store-page");

beforeEach(() => {
  calls.length = 0;
});

const orderRow = (guest: string) => screen.getByText(guest).closest("li")!;

describe("an event's merchandise", () => {
  it("reads the figures with what is oversold, and the items offered with this event's sales and the shared stock left", async () => {
    render(<StorePage eventId={37} />);
    expect(await screen.findByText("Items on sale")).toBeInTheDocument();
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Across 54 orders")).toBeInTheDocument();
    expect(screen.getByText("₹46,270")).toBeInTheDocument();
    // Oversold, as a figure and as the notice that leads to them.
    expect(screen.getByText("Paid after the pieces ran out")).toBeInTheDocument();
    expect(screen.getByText("2 orders were paid after the pieces ran out.")).toBeInTheDocument();

    const shelf = await screen.findByRole("list", { name: "Items on this event" });
    const tee = within(shelf).getByText("Hack Night tee").closest("li")!;
    expect(within(tee).getByText("12 sold here")).toBeInTheDocument();
    expect(within(tee).getByText("33 left · shared")).toBeInTheDocument();
    expect(within(tee).getByLabelText("Hack Night tee left by size")).toHaveTextContent("S 22 · M 11");
    expect(within(tee).getByText("₹5,400")).toBeInTheDocument();
    expect(within(tee).getByText("Everyone · free for Speakers & mentors")).toBeInTheDocument();
    // Editing is the club's: it goes to the Merchandise page, on that item.
    expect(within(tee).getByRole("link", { name: "Edit Hack Night tee" })).toHaveAttribute("href", "/merchandise?item=i1");
    // No per-event on-sale switch any more: on sale is the club's.
    expect(within(tee).queryByRole("switch")).not.toBeInTheDocument();
    const kit = within(shelf).getByText("ESP32-S3 starter kit").closest("li")!;
    expect(within(kit).getByText("Sold out")).toBeInTheDocument();
    expect(within(kit).getByText("none left · shared")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Offer merchandise during registration" })).toBeChecked();
    expect(screen.getByLabelText("M: 19 sold")).toBeInTheDocument();
  });

  it("chooses the items from the club's merchandise, in the order ticked, with PUT offers", async () => {
    render(<StorePage eventId={37} />);
    await screen.findByRole("list", { name: "Items on this event" });
    fireEvent.click(screen.getByRole("button", { name: /Choose items/ }));
    const dialog = await screen.findByRole("dialog");
    // Starts from what the event offers.
    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: "Hack Night tee" })).toBeChecked());
    expect(within(dialog).getByRole("checkbox", { name: "ESP32-S3 starter kit" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Club lanyard" })).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "ESP32-S3 starter kit" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Club lanyard" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "ESP32-S3 starter kit" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toEqual({ method: "PUT", path: "/api/v1/events/37/store/offers", body: { item_ids: ["i1", "i3", "i2"] } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The shelf is read again.
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === "/api/v1/events/37/store").length).toBeGreaterThanOrEqual(2));
  });

  it("removes an item from this event only, after a second press", async () => {
    render(<StorePage eventId={37} />);
    await screen.findByRole("list", { name: "Items on this event" });
    fireEvent.click(screen.getByRole("button", { name: "Remove ESP32-S3 starter kit from this event" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing ESP32-S3 starter kit from this event" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")!.path).toBe("/api/v1/events/37/store/i2");
    // Never the club's item itself.
    expect(calls.some((c) => c.path.startsWith("/api/v1/clubs/store/"))).toBe(false);
  });

  it("settles an oversold order instead of handing it over, then reads the orders again", async () => {
    render(<StorePage eventId={37} />);
    await screen.findByText("Meera Iyer");
    const oversold = orderRow("Meera Iyer");
    expect(within(oversold).getByText("Oversold")).toBeInTheDocument();
    expect(within(oversold).queryByRole("button", { name: "Hand over" })).not.toBeInTheDocument();
    // The paid ones keep theirs.
    expect(within(orderRow("Rohan Patil")).getByRole("button", { name: "Hand over" })).toBeInTheDocument();
    expect(within(orderRow("Aarav Kulkarni")).getByRole("button", { name: /Handed over/ })).toBeInTheDocument();

    const before = calls.filter((c) => c.path === "/api/v1/events/37/store/orders").length;
    fireEvent.click(within(oversold).getByRole("button", { name: "Settle Meera Iyer's order" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/37/store/orders/o3/fulfil")).toBe(true));
    expect(calls.some((c) => c.path.endsWith("/orders/o3/handover"))).toBe(false);
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/events/37/store/orders").length).toBeGreaterThan(before));

    fireEvent.click(within(orderRow("Rohan Patil")).getByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/store/orders/o2/handover")).toBe(true));
  });

  it("filters the orders by status, oversold among them", async () => {
    render(<StorePage eventId={37} />);
    await screen.findByText("Meera Iyer");
    const filters = screen.getByRole("group", { name: "Show orders" });
    expect(within(filters).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "Paid", "Oversold2", "Refunded"]);
    fireEvent.click(within(filters).getByRole("button", { name: /Oversold/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/store/orders" && c.query?.status === "oversold")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Rohan Patil")).not.toBeInTheDocument());
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole("button", { name: "Refunded" }));
    expect(await screen.findByText("No refunded orders.")).toBeInTheDocument();
    fireEvent.click(within(filters).getByRole("button", { name: "All" }));
    expect(await screen.findByText("Rohan Patil")).toBeInTheDocument();
    // "All" sends no status at all (and comes from the cache it filled first).
    const all = calls.filter((c) => c.path === "/api/v1/events/37/store/orders");
    expect(all[0]!.query).toMatchObject({ page: 1, page_size: 10 });
    expect(all[0]!.query?.status).toBeUndefined();
  });

  it("goes to the oversold orders from the notice", async () => {
    render(<StorePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show them" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Show orders" })).getByRole("button", { name: /Oversold/ })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(calls.some((c) => c.query?.status === "oversold")).toBe(true));
  });

  it("switches the shelf off for this event", async () => {
    render(<StorePage eventId={37} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Offer merchandise during registration" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/store/settings"))).toBe(true));
    expect(calls.find((c) => c.path.endsWith("/store/settings"))).toMatchObject({ body: { merch_enabled: false } });
  });
});
