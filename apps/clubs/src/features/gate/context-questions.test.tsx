import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { fetchGateContext } from "./api";
import { gateContextSchema } from "./schemas";

/**
 * The event's own questions ride in the gate's context (for the walk-up form
 * and missing answers). A stored question can say `null` where it has
 * nothing -- a text question's `options` -- and the door must still open:
 * the context is the first thing the console reads, and a refusal to read
 * it shows "The gate could not open" on every phone at the door.
 */
const context = {
  event: {
    id: 1,
    name: "Festival Day",
    code: "E1",
    org_name: "Edge AI Club",
    door_open: true,
    door_mode: "open",
    close_after_minutes: 240,
    spot_registration_checks_in: true,
    capture_contact_at_gate: false,
    require_contact_at_gate: false,
    has_fee: false,
    starts_at: "2026-11-28T03:00:00Z",
    ticket_example: "MOA-XXXXX-XXXXX",
    auto_print_badges: false,
    reprint_policy: "anyone",
  },
  permissions: { check_in: true, walkup: true, merch: false, full: true },
  counters: { registered: 2, checked_in: 0 },
  walkup_roles: ["attendee"],
  doors: [],
  expected_door_id: null,
  guest_fields: [
    { key: "college", label: "College", field_type: "text", required: true, options: null },
    { key: "about", label: "About you", field_type: "textarea", required: false, options: null },
    { key: "track", label: "Track", field_type: "radio", required: true, options: ["Cloud", "AI"] },
    { key: "note", label: null, field_type: null, required: null, options: null, show_if: null },
  ],
  me: { name: "Edge AI Club", kind: "user" },
  has_merch: false,
  has_store: false,
};

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const answering = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() });
  store.clear();
});

describe("the gate's context, with the event's questions as stored", () => {
  it("reads a question's null options, type, requirement and label as absent", () => {
    const read = gateContextSchema.parse(context);
    expect(read.guest_fields.map((f) => [f.key, f.field_type, f.options, f.required, f.label])).toEqual([
      ["college", "text", undefined, true, "College"],
      ["about", "textarea", undefined, false, "About you"],
      ["track", "radio", ["Cloud", "AI"], true, "Track"],
      ["note", undefined, undefined, undefined, ""],
    ]);
  });

  it("is read through the console's own call, not refused", async () => {
    vi.stubGlobal("fetch", answering(context));
    const read = await fetchGateContext(null, 1);
    expect(read.event.name).toBe("Festival Day");
    expect(read.guest_fields).toHaveLength(4);
  });

  it("opens the console on it", async () => {
    vi.stubGlobal("fetch", answering(context));
    const { render } = await import("@/test/render");
    const { GateConsole } = await import("./components/gate-console");
    render(<GateConsole eventId={1} />);
    expect(await screen.findByRole("heading", { name: "Festival Day" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Check-in", "Find", "Walk-up"]);
    expect(screen.queryByText("The gate could not open")).not.toBeInTheDocument();
  });
});
