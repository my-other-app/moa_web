import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const items = [
  { id: "m1", event_id: 37, name: "Welcome tote", photo_key: null, photo_url: null, stock: 150, collected: 30, total: 150, eligibility_field: null, eligibility_value: null, variant_field: null, variants: [], sponsor: null, handout_rule: "door", manual_handed_out: 8, handed_out: 38, created_at: null },
  { id: "m2", event_id: 37, name: "Dev board voucher", photo_key: null, photo_url: null, stock: 3, collected: 0, total: 3, eligibility_field: null, eligibility_value: null, variant_field: null, variants: [], sponsor: "Kinetic Labs", handout_rule: "winners", manual_handed_out: 0, handed_out: 0, created_at: null },
  { id: "m3", event_id: 37, name: "Crew hoodie", photo_key: null, photo_url: null, stock: 8, collected: 5, total: 8, eligibility_field: "role", eligibility_value: "Staff", variant_field: null, variants: [], sponsor: null, handout_rule: "door", manual_handed_out: 0, handed_out: 5, created_at: null },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/handout")) return { ...items[0], manual_handed_out: 9, handed_out: 39 };
        if (path.endsWith("/handout/undo")) return { ...items[0], manual_handed_out: 7, handed_out: 37 };
        return { ...items[1], id: "m9", name: "Sticker sheet" };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SwagTop } = await import("./components/swag-top");

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
});
