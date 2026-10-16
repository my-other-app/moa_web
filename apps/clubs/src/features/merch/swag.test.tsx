import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const items = [
  { id: "m1", event_id: 37, name: "Welcome tote", photo_key: null, photo_url: null, stock: 150, collected: 30, total: 150, eligibility_field: null, eligibility_value: null, variant_field: null, variants: [], sponsor: null, handout_rule: "door", manual_handed_out: 8, handed_out: 38, created_at: null },
  { id: "m2", event_id: 37, name: "Dev board voucher", photo_key: null, photo_url: null, stock: 3, collected: 0, total: 3, eligibility_field: null, eligibility_value: null, variant_field: null, variants: [], sponsor: "Kinetic Labs", handout_rule: "winners", manual_handed_out: 0, handed_out: 0, created_at: null },
  { id: "m3", event_id: 37, name: "Crew hoodie", photo_key: null, photo_url: null, stock: 8, collected: 5, total: 8, eligibility_field: "role", eligibility_value: "Staff", variant_field: null, variants: [], sponsor: null, handout_rule: "door", manual_handed_out: 0, handed_out: 5, created_at: null },
];

const analytics = { collectors: 33, handovers: 35, by_item: [], by_door: [{ id: "d1", name: "Gate A", count: 30 }, { id: null, name: "No door", count: 5 }], by_hour: [{ hour: "2026-10-13T14:00:00", count: 12 }, { hour: "2026-10-13T15:00:00", count: 23 }] };
const handovers = {
  items: [{ id: "h1", registration_id: "r1", name: "Meera Shah", ticket_id: "T-101", role: "attendee", item: { id: "m1", name: "Welcome tote" }, variant: null, door: { id: "d1", name: "Gate A", kind: "door" }, collected_at: "2026-10-13T14:20:00+00:00", by: { kind: "PERSON", id: 9, name: "Vani" } }],
  total: 1,
  page: 1,
  page_size: 50,
  facets: { total: 35, items: [{ id: "m1", name: "Welcome tote", count: 30 }, { id: "m3", name: "Crew hoodie", count: 5 }], variants: [], doors: [{ id: "d1", name: "Gate A", kind: "door", count: 30 }], staff: [{ id: 9, name: "Vani", count: 35 }], without_door: 5, first_at: "2026-10-13T14:00:00+00:00", last_at: "2026-10-13T15:40:00+00:00" },
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, body: options?.query });
        if (path.endsWith("/37/merch")) return items;
        if (path.endsWith("/merch/analytics")) return analytics;
        if (path.endsWith("/merch/collections")) return handovers;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/handout")) return { ...items[0], manual_handed_out: 9, handed_out: 39 };
        if (path.endsWith("/handout/undo")) return { ...items[0], manual_handed_out: 7, handed_out: 37 };
        return { ...items[1], id: "m9", name: "Sticker sheet" };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...items[0], ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SwagTop } = await import("./components/swag-top");
const { MerchPage } = await import("./components/merch-page");

beforeEach(() => {
  calls.length = 0;
});

describe("swag", () => {
  it("shows the four figures and a card per item with who gets it and the sponsor", () => {
    render(<SwagTop eventId={37} items={items as never} onEdit={() => undefined} />);
    expect(screen.getByText("Swag items")).toBeInTheDocument();
    expect(screen.getByText("1 sponsored")).toBeInTheDocument();
    expect(screen.getByText("161")).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(screen.getByText("118")).toBeInTheDocument();
    expect(screen.getByText("Everyone who checks in")).toBeInTheDocument();
    expect(screen.getByText("Winners only · handed over at results")).toBeInTheDocument();
    expect(screen.getByText("Only Staff")).toBeInTheDocument();
    expect(screen.getByText("Kinetic Labs")).toBeInTheDocument();
    expect(screen.getByText("At results")).toBeInTheDocument();
  });

  it("counts one out by hand, takes it back, and adds a sponsored item for the winners", async () => {
    render(<SwagTop eventId={37} items={items as never} onEdit={() => undefined} />);
    fireEvent.click(screen.getAllByRole("button", { name: /1 handed out/ })[0]!);
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/merch/m1/handout"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Undo one for Welcome tote" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/merch/m1/handout/undo"))).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: /Add swag/ }));
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "Sticker sheet" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Who gets it"), { target: { value: "winners" } });
    fireEvent.change(screen.getByLabelText("Sponsor (optional)"), { target: { value: "Kinetic Labs" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add swag" })[1]!);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/merch"))).toBe(true));
    expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/merch"))).toMatchObject({ body: { name: "Sticker sheet", stock: 60, handout_rule: "winners", sponsor: "Kinetic Labs", eligibility_field: null } });
  });

  it("shows when things went out and who received what, and edits who gets an item and its sponsor", async () => {
    render(<MerchPage eventId={37} />);
    expect(await screen.findByText("Meera Shah")).toBeInTheDocument();
    expect(screen.getByText("Who received what")).toBeInTheDocument();
    expect(screen.getByText("Scanned out, hour by hour")).toBeInTheDocument();
    expect(screen.getByText("35 handovers · 33 guests")).toBeInTheDocument();
    expect(screen.getByText("30 scanned at the gate · 8 by hand")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "m1" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/merch/collections") && (c.body as { item_id?: string })?.item_id === "m1")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Edit Welcome tote" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Who gets it")).toHaveValue("everyone");
    fireEvent.change(within(dialog).getByLabelText("Who gets it"), { target: { value: "first" } });
    fireEvent.change(within(dialog).getByLabelText("Sponsor (optional)"), { target: { value: "Kinetic Labs" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/merch/m1"))).toMatchObject({ body: { name: "Welcome tote", stock: 150, sponsor: "Kinetic Labs", handout_rule: "first_n", eligibility_field: null } }));
  });
});
