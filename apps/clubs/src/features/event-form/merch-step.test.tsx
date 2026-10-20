import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Form } from "@moa/ui";

import eventDetail from "../__fixtures__/event-detail.json";

/**
 * The entry step's "Merchandise for sale": a check mark that, ticked, lists
 * the club's items to tick the ones this event sells, in the order ticked.
 * The form sends `merch_enabled` and `store_item_ids`; editing starts from
 * GET /events/{id}/store/offers; the plan's per-event cap shuts the rest.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const item = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  photo_url: null,
  photo_key: null,
  price: 450,
  stock: 40,
  variants: [],
  available_roles: null,
  free_roles: [],
  on_sale: true,
  sort_order: 0,
  sold: 0,
  held: 0,
  left: 40,
  earned: 0,
  events: [],
  ...over,
});
const TEE = item("i1", "Hack Night tee", { photo_url: "https://cdn.example/tee.png", stock: null, left: 22, variants: [{ id: "v1", label: "S", stock: 10, sold: 2, held: 0, left: 8 }, { id: "v2", label: "M", stock: 20, sold: 6, held: 0, left: 14 }] });
const LANYARD = item("i2", "Club lanyard", { price: 80, left: 93 });
const STICKERS = item("i3", "Sticker pack", { price: 0, left: 0, on_sale: false });

/** Plans enforced, merchandise on the plan, and two items an event. */
const ENTITLEMENTS = {
  plan_key: "pro",
  plan_name: "Pro",
  status: "active",
  cycle: "monthly",
  current_period_end: null,
  limits: { merch_items_per_event: 2 },
  features: { merch: true, swag: true, tickets: true },
  configured: true,
  requested_plan: null,
  requested_cycle: null,
  subscription_status: null,
  usage: {},
  enforced: true,
  grandfathered_before: null,
};

const state = { items: [TEE, LANYARD, STICKERS] as unknown[], entitlements: null as unknown, offers: { merch_enabled: true, item_ids: ["i3", "i1"] } as unknown, offersFail: false };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/store") return { items: state.items };
        if (path === "/api/v1/clubs/entitlements" && state.entitlements) return state.entitlements;
        if (path === "/api/v1/events/info/37") return { ...eventDetail, merch_enabled: true, plan_grandfathered: false };
        if (path === "/api/v1/events/37/store/offers") {
          if (state.offersFail) throw new Error("Not Found");
          return state.offers;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { id: 37, name: "SF Sea Hackathon" };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EntryStep } = await import("./components/steps/entry-step");
const { EditEventForm } = await import("./components/edit-event-form");
const { emptyEventForm } = await import("./components/event-form");
const { toEventFormData } = await import("./api");
const { eventFormSchema } = await import("./schemas");
type Values = import("./schemas").EventFormValues;

let form: UseFormReturn<Values>;

function Harness({ defaults }: { defaults: Values }) {
  const f = useForm<Values>({ defaultValues: defaults });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <EntryStep />
      </form>
    </Form>
  );
}

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };
const wire = () => toEventFormData(eventFormSchema.parse({ ...form.getValues(), ...required }));
const row = (name: string) => screen.getByRole("checkbox", { name });

beforeEach(() => {
  calls.length = 0;
  state.items = [TEE, LANYARD, STICKERS];
  state.entitlements = null;
  state.offers = { merch_enabled: true, item_ids: ["i3", "i1"] };
  state.offersFail = false;
});

describe("merchandise on the event form", () => {
  it("is a check mark; ticked, it lists the club's items with a thumbnail, price and stock left", async () => {
    render(<Harness defaults={emptyEventForm} />);
    const merch = screen.getByRole("checkbox", { name: "Merchandise for sale" });
    expect(merch).not.toBeChecked();
    expect(screen.queryByRole("list", { name: "Your merchandise" })).not.toBeInTheDocument();
    fireEvent.click(merch);
    expect(merch).toBeChecked();
    const list = await screen.findByRole("list", { name: "Your merchandise" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Hack Night tee");
    expect(rows[0]).toHaveTextContent("₹450 · S 8 · M 14");
    expect(rows[0]!.querySelector("img")).toHaveAttribute("src", "https://cdn.example/tee.png");
    expect(rows[1]).toHaveTextContent("₹80 · 93 left");
    expect(rows[2]).toHaveTextContent("Free · Sold out");
    expect(rows[2]).toHaveTextContent("Hidden");
    expect(screen.getByRole("link", { name: /Manage merchandise/ })).toHaveAttribute("href", "/merchandise");
  });

  it("keeps the order the items are ticked and sends it as store_item_ids with merch_enabled", async () => {
    render(<Harness defaults={emptyEventForm} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Merchandise for sale" }));
    await screen.findByRole("list", { name: "Your merchandise" });
    fireEvent.click(row("Club lanyard"));
    fireEvent.click(row("Hack Night tee"));
    expect(form.getValues("store_item_ids")).toEqual(["i2", "i1"]);
    // Each ticked row says its place.
    expect(within(row("Club lanyard").closest("li")!).getByTitle("Its place on the registration page")).toHaveTextContent("1");
    expect(within(row("Hack Night tee").closest("li")!).getByTitle("Its place on the registration page")).toHaveTextContent("2");
    let fd = wire();
    expect(fd.get("merch_enabled")).toBe("true");
    expect(fd.get("store_item_ids")).toBe('["i2","i1"]');

    // Taking the first off moves the second up; ticking it again puts it last.
    fireEvent.click(row("Club lanyard"));
    fireEvent.click(row("Sticker pack"));
    fireEvent.click(row("Club lanyard"));
    expect(form.getValues("store_item_ids")).toEqual(["i1", "i3", "i2"]);
    fd = wire();
    expect(JSON.parse(String(fd.get("store_item_ids")))).toEqual(["i1", "i3", "i2"]);

    // Merchandise off: the choice is not sent, so it is there when it comes back on.
    fireEvent.click(screen.getByRole("checkbox", { name: "Merchandise for sale" }));
    fd = wire();
    expect(fd.get("merch_enabled")).toBe("false");
    expect(fd.get("store_item_ids")).toBeNull();
  });

  it("sends an empty list when merchandise is on with nothing ticked", async () => {
    render(<Harness defaults={{ ...emptyEventForm, merch_enabled: true }} />);
    await screen.findByRole("list", { name: "Your merchandise" });
    expect(screen.getByText("Nothing chosen yet.")).toBeInTheDocument();
    expect(wire().get("store_item_ids")).toBe("[]");
  });

  it("says where to add items when the club has none", async () => {
    state.items = [];
    render(<Harness defaults={{ ...emptyEventForm, merch_enabled: true }} />);
    const empty = await screen.findByText(/No merchandise yet/);
    expect(empty).toHaveTextContent("No merchandise yet. Add items under Merchandise");
    expect(within(empty).getByRole("link", { name: /Merchandise/ })).toHaveAttribute("href", "/merchandise");
  });

  it("shuts the unticked rows at the plan's cap, with the plan's words, and opens them again under it", async () => {
    state.entitlements = ENTITLEMENTS;
    render(<Harness defaults={{ ...emptyEventForm, merch_enabled: true, store_item_ids: [] }} />);
    await screen.findByRole("list", { name: "Your merchandise" });
    // The meter needs the entitlements: wait for them before ticking.
    expect(await screen.findByText("0 of 2 items · Pro")).toBeInTheDocument();
    fireEvent.click(row("Hack Night tee"));
    fireEvent.click(row("Club lanyard"));
    expect(await screen.findByText("2 of 2 items · Pro")).toBeInTheDocument();
    expect(row("Sticker pack")).toBeDisabled();
    expect(row("Hack Night tee")).not.toBeDisabled();
    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("You've used 2 of 2 items");
    // A disabled row cannot be ticked.
    fireEvent.click(row("Sticker pack"));
    expect(form.getValues("store_item_ids")).toEqual(["i1", "i2"]);

    fireEvent.click(row("Club lanyard"));
    await waitFor(() => expect(row("Sticker pack")).not.toBeDisabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("editing an event's merchandise", () => {
  it("starts from the items the event offers, in their order, and sends the change", async () => {
    render(<EditEventForm eventId={37} />);
    const merch = await screen.findByRole("checkbox", { name: "Merchandise for sale" });
    expect(merch).toBeChecked();
    await screen.findByRole("list", { name: "Your merchandise" });
    expect(calls.some((c) => c.path === "/api/v1/events/37/store/offers")).toBe(true);
    expect(row("Sticker pack")).toBeChecked();
    expect(row("Hack Night tee")).toBeChecked();
    expect(row("Club lanyard")).not.toBeChecked();
    expect(within(row("Sticker pack").closest("li")!).getByTitle("Its place on the registration page")).toHaveTextContent("1");
    expect(within(row("Hack Night tee").closest("li")!).getByTitle("Its place on the registration page")).toHaveTextContent("2");
    // Nothing changed yet.
    const save = screen.getAllByRole("button", { name: /All changes saved/ })[0]!;
    expect(save).toBeDisabled();

    fireEvent.click(row("Sticker pack"));
    fireEvent.click(row("Club lanyard"));
    const changed = await screen.findAllByRole("button", { name: /Save changes/ });
    fireEvent.click(changed[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")).toBe(true));
    const fd = calls.find((c) => c.method === "PUT")!.body as FormData;
    expect(fd.get("merch_enabled")).toBe("true");
    expect(fd.get("store_item_ids")).toBe('["i1","i2"]');
  });

  it("leaves the offers alone when they cannot be read", async () => {
    state.offersFail = true;
    render(<EditEventForm eventId={37} />);
    expect(await screen.findByText(/Could not read which items this event sells/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose them on its Merchandise tab" })).toHaveAttribute("href", "/events/37/store");
    expect(screen.queryByRole("list", { name: "Your merchandise" })).not.toBeInTheDocument();
  });
});
