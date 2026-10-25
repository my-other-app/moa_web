import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";

import eventDetail from "../__fixtures__/event-detail.json";

/**
 * Ticket types in the event form (Places and money): one kind of ticket at
 * the event's own fee and places, or several, each with its price, places,
 * window, per-person limit and whether it is listed. Saved with the event:
 * PUT /events/{id}/ticketing/types first when editing (refused, nothing is
 * saved), after the event when making one (the event stands either way).
 * Against a backend without ticket types, none of it shows and nothing
 * about types is sent.
 */
type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];

const TYPES = {
  types: [
    { id: 11, name: "General", description: null, price: 250, capacity: 80, sales_start: null, sales_end: null, is_hidden: false, per_person_limit: null, sort_order: 0, is_default: true, sold: 12, available: 68, waiting: 0, offered: 0, has_registrations: true },
    { id: 12, name: "Student", description: "Bring your ID", price: 99, capacity: 20, sales_start: null, sales_end: "2026-11-01T12:30:00+05:30", is_hidden: false, per_person_limit: 1, sort_order: 1, is_default: false, sold: 0, available: 20, waiting: 0, offered: 0, has_registrations: false },
  ],
  follows_event: false,
  event_capacity: 100,
  event_available: 88,
  max_types: null,
};
const ONE_TYPE = { ...TYPES, types: [{ ...TYPES.types[0]!, price: 0, capacity: 100, sold: 3 }], follows_event: true };

const state = {
  server: "new" as "new" | "old",
  types: TYPES as unknown,
  putTypes: null as null | (() => Promise<unknown>),
};

const missing = () => toApiError(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/discount-codes") {
          if (state.server === "old") throw await missing();
          return [];
        }
        if (path === "/api/v1/events/37/ticketing/types") {
          if (state.server === "old") throw await missing();
          return state.types;
        }
        if (path === "/api/v1/events/info/37") return { ...eventDetail, has_fee: true, reg_fee: 99, max_participants: 100, plan_grandfathered: false };
        if (path === "/api/v1/events/37/store/offers") return { merch_enabled: false, item_ids: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/create") return { id: 41, name: "New Night" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path.endsWith("/ticketing/types")) {
          if (state.putTypes) return state.putTypes();
          return TYPES;
        }
        return { id: 37, name: "SF Sea Hackathon" };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EditEventForm, EventForm, emptyEventForm } = await import("@/features/event-form");
const { saveTypesBody, feeFromTypes, ticketTypeDraftSchema } = await import("./index");

const puts = () => calls.filter((c) => c.method === "PUT");

beforeEach(() => {
  calls.length = 0;
  state.server = "new";
  state.types = TYPES;
  state.putTypes = null;
});

describe("what the form saves about types", () => {
  it("with one kind of ticket: that one type at the event's own fee and places", () => {
    expect(saveTypesBody({ has_fee: true, reg_fee: "250", max_participants: "80", several_types: false, ticket_types: [{ id: 11, name: "Entry", price: 0 }] })).toEqual({
      types: [{ id: 11, name: "Entry", description: null, price: 250, capacity: 80, sales_start: null, sales_end: null, is_hidden: false, per_person_limit: null }],
    });
    // Free, no cap, no name yet.
    expect(saveTypesBody({ has_fee: false, several_types: false, ticket_types: [] })!.types[0]).toMatchObject({ name: "General admission", price: 0, capacity: null });
    // Nothing to say about types: a server without them.
    expect(saveTypesBody({ has_fee: true, reg_fee: 100 })).toBeNull();
  });

  it("with several: every type as typed, the order kept, and the event's total", () => {
    const body = saveTypesBody({
      several_types: true,
      max_participants: "",
      ticket_types: [
        { id: 11, name: " General ", price: "250", capacity: "80", is_hidden: false },
        { name: "Sponsor", price: "", capacity: "", is_hidden: true, per_person_limit: "2", sales_start: "2026-10-30T10:00", description: " " },
      ],
    })!;
    expect(body.event_capacity).toBeNull();
    expect(body.types.map((t) => [t.id, t.name, t.price, t.capacity, t.is_hidden, t.per_person_limit, t.sales_start, t.description])).toEqual([
      [11, "General", 250, 80, false, null, null, null],
      [undefined, "Sponsor", 0, null, true, 2, "2026-10-30T10:00", null],
    ]);
  });

  it("sends the event's own fee as its types charge: paid from the lowest price", () => {
    const v = feeFromTypes({ several_types: true, has_fee: false, reg_fee: undefined, ticket_types: [{ name: "A", price: 0 }, { name: "B", price: "300" }, { name: "C", price: 150 }] });
    expect([v.has_fee, v.reg_fee]).toEqual([true, 150]);
    expect(feeFromTypes({ several_types: true, has_fee: true, reg_fee: 50, ticket_types: [{ name: "Free", price: 0 }] })).toMatchObject({ has_fee: false, reg_fee: undefined });
    const one = { several_types: false, has_fee: true, reg_fee: 80, ticket_types: [] };
    expect(feeFromTypes(one)).toBe(one);
  });

  it("checks a type's window, price and limits", () => {
    expect(ticketTypeDraftSchema.safeParse({ name: "X", price: -1 }).success).toBe(false);
    expect(ticketTypeDraftSchema.safeParse({ name: "", price: 1 }).success).toBe(false);
    const bad = ticketTypeDraftSchema.safeParse({ name: "X", price: 1, sales_start: "2026-11-02T10:00", sales_end: "2026-11-01T10:00" });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.path).toEqual(["sales_end"]);
    expect(ticketTypeDraftSchema.parse({ name: "X", price: "", capacity: "", per_person_limit: "" })).toMatchObject({ price: 0, capacity: undefined, per_person_limit: undefined });
  });
});

describe("editing an event that sells several types", () => {
  it("starts from its types, and saves them before the event", async () => {
    render(<EditEventForm eventId={37} />);
    const group = await screen.findByRole("group", { name: "Ticket types" });
    const rows = within(group).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByLabelText("Name")).toHaveValue("General");
    expect(within(rows[0]!).getByLabelText("Price of General")).toHaveValue(250);
    expect(within(rows[0]!).getByText(/12 sold · can be hidden, not removed/)).toBeInTheDocument();
    // People hold General: it can be hidden, not removed.
    expect(within(rows[0]!).getByRole("button", { name: "Remove General" })).toBeDisabled();
    expect(within(rows[1]!).getByLabelText("Places of Student")).toHaveValue(20);
    // "Places" is the total across types now; the event's fee is the types'.
    expect(screen.getByLabelText(/Total places, all ticket types/)).toHaveValue(100);
    expect(screen.queryByRole("switch", { name: "Paid entry" })).not.toBeInTheDocument();

    fireEvent.change(within(rows[1]!).getByLabelText("Price of Student"), { target: { value: "120" } });
    fireEvent.click(within(group).getByRole("button", { name: /Add a ticket type/ }));
    const added = within(group).getAllByRole("listitem")[2]!;
    fireEvent.change(within(added).getByLabelText("Name"), { target: { value: "VIP" } });
    fireEvent.change(within(added).getByLabelText("Price of VIP"), { target: { value: "900" } });
    fireEvent.click(within(added).getByRole("switch", { name: "Hide VIP" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Save changes/ })[0]!);

    await waitFor(() => expect(puts()).toHaveLength(2));
    const [types, event] = puts();
    expect(types!.path).toBe("/api/v1/events/37/ticketing/types");
    expect(event!.path).toBe("/api/v1/events/update/37");
    const body = types!.body as { types: Array<Record<string, unknown>>; event_capacity: number | null };
    expect(body.event_capacity).toBe(100);
    expect(body.types.map((t) => [t.id ?? null, t.name, t.price, t.is_hidden])).toEqual([
      [11, "General", 250, false],
      [12, "Student", 120, false],
      [null, "VIP", 900, true],
    ]);
    expect(body.types[1]!.per_person_limit).toBe(1);
    // The event's own fee, as its types charge.
    const fd = event!.body as FormData;
    expect(fd.get("has_fee")).toBe("true");
    expect(fd.get("reg_fee")).toBe("120");
  });

  it("says why when the types are refused, and saves nothing else", async () => {
    state.putTypes = async () => {
      throw new ApiError({ message: "People hold tickets of “Student”.", status: 409, errorCode: "TICKET_TYPE_HAS_REGISTRATIONS", fieldErrors: { ticket_type_id: 12 } as unknown as Record<string, string[]> });
    };
    render(<EditEventForm eventId={37} />);
    const group = await screen.findByRole("group", { name: "Ticket types" });
    fireEvent.change(within(within(group).getAllByRole("listitem")[1]!).getByLabelText("Price of Student"), { target: { value: "50" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save changes/ })[0]!);
    expect(await screen.findByText(/People hold tickets of that type, so it can't be removed. Hide it instead/)).toBeInTheDocument();
    expect(puts().map((c) => c.path)).toEqual(["/api/v1/events/37/ticketing/types"]);
  });
});

describe("an event with one kind of ticket", () => {
  it("keeps the fee and places, and turns them into the first of several types", async () => {
    state.types = ONE_TYPE;
    render(<EditEventForm eventId={37} />);
    expect(await screen.findByText("One kind of ticket")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Places" })).toHaveValue(100);
    fireEvent.click(screen.getByRole("button", { name: /Sell several ticket types/ }));
    const group = await screen.findByRole("group", { name: "Ticket types" });
    const rows = within(group).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // The event's fee (₹99) and places (100) became the first type's.
    expect(within(rows[0]!).getByLabelText("Price of General")).toHaveValue(99);
    expect(within(rows[0]!).getByLabelText("Places of General")).toHaveValue(100);
    expect((screen.getByLabelText(/Total places, all ticket types/) as HTMLInputElement).value).toBe("");

    // And back: one kind of ticket again, at the first type's price and places.
    fireEvent.click(within(group).getByRole("button", { name: "Back to one kind of ticket" }));
    expect(await screen.findByText("One kind of ticket")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Places" })).toHaveValue(100);
  });

  it("saves the one type at the event's own fee and places", async () => {
    state.types = ONE_TYPE;
    render(<EditEventForm eventId={37} />);
    await screen.findByText("One kind of ticket");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Places" }), { target: { value: "150" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save changes/ })[0]!);
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[0]!.body).toEqual({
      types: [{ id: 11, name: "General", description: null, price: 99, capacity: 150, sales_start: null, sales_end: null, is_hidden: false, per_person_limit: null }],
    });
  });
});

describe("a backend without ticket types", () => {
  it("shows no editor, and sends nothing about types", async () => {
    state.server = "old";
    render(<EditEventForm eventId={37} />);
    expect(await screen.findByRole("spinbutton", { name: "Places" })).toHaveValue(100);
    expect(screen.queryByText("One kind of ticket")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ticket types" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Places" }), { target: { value: "120" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save changes/ })[0]!);
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]!.path).toBe("/api/v1/events/update/37");
  });

  it("offers no types on a new event either", async () => {
    state.server = "old";
    render(<EventForm mode="create" defaultValues={emptyEventForm} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/discount-codes")).toBe(true));
    expect(screen.queryByText("One kind of ticket")).not.toBeInTheDocument();
  });
});

describe("a new event with several types", () => {
  it("is made, then its types saved on it", async () => {
    render(
      <EventForm
        mode="create"
        defaultValues={{ ...emptyEventForm, name: "New Night", category_id: 3, event_datetime: "2026-11-20T18:00", duration: 2, location_name: "Hall A", has_fee: true, reg_fee: 200, max_participants: 60 }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Sell several ticket types/ }));
    const group = await screen.findByRole("group", { name: "Ticket types" });
    const second = within(group).getAllByRole("listitem")[1]!;
    fireEvent.change(within(second).getByLabelText("Name"), { target: { value: "Student" } });
    fireEvent.change(within(second).getByLabelText("Price of Student"), { target: { value: "0" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save as draft/ })[0]!);
    await waitFor(() => expect(puts().length).toBe(1));
    const create = calls.find((c) => c.method === "POST" && c.path === "/api/v1/events/create")!;
    const fd = create.body as FormData;
    // Paid, from the lowest paid type; no event total (each type has its own places).
    expect([fd.get("has_fee"), fd.get("reg_fee"), fd.get("max_participants")]).toEqual(["true", "200", null]);
    expect(puts()[0]!.path).toBe("/api/v1/events/41/ticketing/types");
    expect((puts()[0]!.body as { types: Array<Record<string, unknown>> }).types.map((t) => [t.name, t.price, t.capacity])).toEqual([
      ["General admission", 200, 60],
      ["Student", 0, null],
    ]);
  });
});
