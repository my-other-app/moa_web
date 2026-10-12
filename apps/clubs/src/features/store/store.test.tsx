import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import summary from "../__fixtures__/store-summary.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const items = [
  { id: "i1", event_id: 37, name: "Hack Night tee", description: null, photo_key: null, photo_url: null, price: 450, stock: null, sold: 48, total: 120, left: 72, earned: 21600, available_roles: null, free_roles: ["speaker"], on_sale: true, sold_out: false, sort_order: 0, variants: [{ id: "v1", label: "S", stock: 30, sold: 8, left: 22 }, { id: "v2", label: "M", stock: 30, sold: 19, left: 11 }], created_at: "2026-10-01T00:00:00+00:00" },
  { id: "i2", event_id: 37, name: "ESP32-S3 starter kit", description: null, photo_key: null, photo_url: null, price: 890, stock: 25, sold: 25, total: 25, left: 0, earned: 22250, available_roles: ["attendee", "staff"], free_roles: [], on_sale: true, sold_out: true, sort_order: 1, variants: [], created_at: "2026-10-01T00:00:00+00:00" },
  { id: "i3", event_id: 37, name: "Club lanyard", description: null, photo_key: null, photo_url: null, price: 80, stock: 100, sold: 7, total: 100, left: 93, earned: 560, available_roles: null, free_roles: [], on_sale: false, sold_out: false, sort_order: 2, variants: [], created_at: "2026-10-01T00:00:00+00:00" },
];
const orders = { items: [{ id: "o1", registration_id: "r1", guest: "Aarav Kulkarni", ticket_id: "T1", status: "paid", total: 510, lines: [], summary: "Tee (M), Sticker pack", paid_at: "2026-10-12T00:00:00+00:00", handed_over_at: "2026-10-12T01:00:00+00:00", created_at: "2026-10-12T00:00:00+00:00" }, { id: "o2", registration_id: "r2", guest: "Rohan Patil", ticket_id: "T2", status: "paid", total: 450, lines: [], summary: "Tee (L)", paid_at: "2026-10-12T00:00:00+00:00", handed_over_at: null, created_at: "2026-10-12T00:00:00+00:00" }], total: 2, page: 1, page_size: 10 };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/store/summary")) return summary;
        if (path.endsWith("/store")) return items;
        if (path.endsWith("/store/orders")) return orders;
        if (path.includes("/events/info/")) return { id: 37, name: "Hack Night 04", merch_enabled: true, status: "published", category: { id: 1, name: "Hackathon" } };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/handover")) return { ...orders.items[1], handed_over_at: "2026-10-12T02:00:00+00:00" };
        return { ...items[2], id: "i9", name: "Hoodie", variants: [{ id: "v9", label: "S", stock: 10, sold: 0, left: 10 }], total: 20 };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/settings")) return { merch_enabled: false, swag_enabled: false };
        return { ...items[2], on_sale: true };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { StorePage } = await import("./components/store-page");

beforeEach(() => {
  calls.length = 0;
});

describe("merchandise", () => {
  it("reads the figures, the shelf with each item's sales and status, the sizes and the orders", async () => {
    render(<StorePage eventId={37} />);
    expect(await screen.findByText("Items on sale")).toBeInTheDocument();
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Across 54 orders")).toBeInTheDocument();
    expect(screen.getByText("₹46,270")).toBeInTheDocument();
    expect(screen.getByText("On top of ₹15,100 in tickets")).toBeInTheDocument();
    expect(await screen.findByText("Hack Night tee")).toBeInTheDocument();
    expect(screen.getByText("Everyone · free for Speakers & mentors")).toBeInTheDocument();
    expect(screen.getByText("Only Attendees, Volunteers")).toBeInTheDocument();
    expect(screen.getByText("48 / 120 sold")).toBeInTheDocument();
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Offer merchandise during registration" })).toBeChecked();
    expect(screen.getByLabelText("M: 19 sold")).toBeInTheDocument();
    expect(await screen.findByText("Rohan Patil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Handed over/ })).toBeInTheDocument();
  });

  it("adds an item with sizes and roles, toggles sale, hands an order over, and switches the shelf off", async () => {
    render(<StorePage eventId={37} />);
    await screen.findByText("Hack Night tee");
    fireEvent.click(screen.getByRole("button", { name: /Add item/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hoodie" } });
    fireEvent.change(screen.getByLabelText("Price (₹)"), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Sizes (optional, comma separated)"), { target: { value: "S, M" } });
    fireEvent.change(screen.getByLabelText("Stock per size"), { target: { value: "10" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Speakers & mentors" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Add to store" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/store"))).toBe(true));
    expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/store"))).toMatchObject({ body: { name: "Hoodie", price: 900, stock: null, variants: [{ label: "S", stock: 10 }, { label: "M", stock: 10 }], available_roles: ["speaker"], free_roles: [] } });

    fireEvent.click(screen.getByRole("switch", { name: "Club lanyard on sale" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path.endsWith("/store/i3"))).toBe(true));
    expect(calls.find((c) => c.path.endsWith("/store/i3"))).toMatchObject({ body: { on_sale: true } });

    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/orders/o2/handover"))).toBe(true));

    fireEvent.click(screen.getByRole("switch", { name: "Offer merchandise during registration" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/store/settings"))).toBe(true));
    expect(calls.find((c) => c.path.endsWith("/store/settings"))).toMatchObject({ body: { merch_enabled: false } });
  });
});
