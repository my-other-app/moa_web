import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@moa/api";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const device = { id: "k1", event_id: 42, name: "Lobby tablet", door_id: "d1", door_label: "Lobby kiosk", token_prefix: "jTCuFS", expires_at: "2026-10-12T00:00:00Z", last_seen_at: null, revoked_at: null, online: false, active: true, created_at: "2026-10-11T00:00:00Z" };
const settings = { self_check_in_enabled: true, self_check_in_verify: "email", self_check_in_print: true, has_pin: false };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.endsWith("/settings")) return settings;
    if (method === "POST") return { device, token: "kiosk_jTCuFSxxxxxxxxxxxxxxxxxxxxxxxxxx", url: "https://club-dashboard.myotherapp.in/kiosk?token=kiosk_jTCuFSxxxxxxxxxxxxxxxxxxxxxxxxxx" };
    if (method === "DELETE") return { ...device, revoked_at: "2026-10-11T01:00:00Z", active: false };
    return [device];
  };
  return { ...actual, api: { get: vi.fn((path: string) => record("GET")(path)), put: vi.fn(record("PUT")), patch: vi.fn(record("PATCH")), post: vi.fn(record("POST")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");
const { kioskContextSchema, redeemResultSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("the organiser's kiosk endpoints", () => {
  it("pairs, rotates, unpairs and configures under the event", async () => {
    const paired = await api.pairKiosk(42, { name: "Lobby tablet", door_id: "d1", shift_hours: 12 });
    await api.rotateKiosk(42, "k1");
    await api.unpairKiosk(42, "k1");
    await api.fetchKiosks(42);
    await api.updateKioskSettings(42, { self_check_in_verify: "name", kiosk_pin: "2468" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/v1/events/42/kiosks", "POST /api/v1/events/42/kiosks/k1/rotate", "DELETE /api/v1/events/42/kiosks/k1", "GET /api/v1/events/42/kiosks", "PATCH /api/v1/events/42/kiosks/settings"]);
    expect(paired.url).toContain("/kiosk?token=kiosk_");
    expect(calls[0]?.body).toEqual({ name: "Lobby tablet", door_id: "d1", shift_hours: 12 });
    expect(calls[1]?.body).toEqual({ shift_hours: 12 });
  });
});

describe("the cards a kiosk prints", () => {
  it("never carry the device token in the link: it goes in the X-Kiosk-Token header", () => {
    expect(api.kioskCardUrl("/api/v1/kiosk/card.pdf?redemption=r.1")).toBe("/api/gateway/api/v1/kiosk/card.pdf?redemption=r.1");
    expect(api.kioskSelfCardUrl("s/1+2")).toBe("/api/gateway/api/v1/kiosk/self-card.pdf?session=s%2F1%2B2");
    expect(api.kioskHeaders("kiosk_abc")).toEqual({ "X-Kiosk-Token": "kiosk_abc" });
  });
});

describe("the staff PIN", () => {
  it("is checked for length before it is sent", () => {
    expect(api.pinProblem("")).toBeNull();
    expect(api.pinProblem("123")).toBe("A PIN of 4 digits or more.");
    expect(api.pinProblem("1234")).toBeNull();
  });

  it("reads the API's refusal of a short PIN, in either shape", () => {
    const wave1 = new ApiError({ message: "A PIN of four characters or more.", status: 422, fieldErrors: { fields: { kiosk_pin: "Four characters or more." } } as unknown as Record<string, string[]> });
    const pydantic = new ApiError({ message: "Some of the submitted values were not valid.", status: 422, fieldErrors: { kiosk_pin: ["String should have at least 4 characters"] } });
    expect(api.pinFieldError(wave1)).toBe("Four characters or more.");
    expect(api.pinFieldError(pydantic)).toBe("String should have at least 4 characters");
    expect(api.pinFieldError(new ApiError({ message: "x", status: 500 }))).toBeNull();
  });

  it("says a locked kiosk in plain words, and a wrong PIN as such", () => {
    expect(api.staffProblem(new ApiError({ message: "Too many wrong PINs on this kiosk. Try again in a few minutes.", status: 429, errorCode: "PIN_LOCKED" }))).toBe("Too many tries, wait 15 minutes.");
    expect(api.staffProblem(new ApiError({ message: "That PIN does not open staff mode on this kiosk.", status: 403 }))).toBe("That PIN does not open staff mode on this kiosk.");
  });
});

describe("what the kiosk reads from the server", () => {
  it("fills the defaults a kiosk needs when the event has no branding", () => {
    const ctx = kioskContextSchema.parse({
      device: { id: "k1", name: "Lobby tablet", door: "Lobby kiosk", expires_at: "2026-10-12T00:00:00Z" },
      event: { id: 42, name: "Annual day", door_open: true },
      self_check_in: { self_check_in_enabled: false, self_check_in_verify: "email", self_check_in_print: true, has_pin: false },
      counters: { registered: 10, checked_in: 3, checked_in_here: 1 },
    });
    expect(ctx.event.brand_primary).toBe("#1db9a0");
    expect(ctx.event.auto_print_badges).toBe(false);
  });

  it("keeps a refused scan's reason and a match's print link", () => {
    const refused = redeemResultSchema.parse({ outcome: "WRONG_EVENT", guest: null, other_event: { name: "Alumni meet" }, redemption_token: null, print_url: null });
    expect(refused.other_event?.name).toBe("Alumni meet");
    const matched = redeemResultSchema.parse({
      outcome: "MATCHED",
      guest: { id: "r1", first_name: "Ananya", display_name: "Ananya Iyer", role: "ATTENDEE", role_label: "Attendee", ticket_id: "AB12CD", already_checked_in: false, has_card: true, may_print: true },
      other_event: null,
      redemption_token: "x.y",
      print_url: "/api/v1/kiosk/card.pdf?redemption=x.y",
      auto_print: true,
    });
    expect(matched.auto_print).toBe(true);
    expect(matched.guest?.first_name).toBe("Ananya");
  });
});
