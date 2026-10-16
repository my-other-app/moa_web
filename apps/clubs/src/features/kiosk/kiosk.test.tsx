import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import type { KioskContext, RedeemResult } from "./schemas";

const ctx: KioskContext = {
  device: { id: "k1", name: "Lobby tablet", door: "Lobby kiosk", expires_at: "2026-10-17T00:00:00Z" },
  event: { id: 37, name: "Hack Night 04", org_name: "Edge AI Club", venue: null, starts_at: null, brand_primary: "#1db9a0", poster_url: null, door_open: true, reprint_policy: "anyone", auto_print_badges: false, has_fee: false },
  self_check_in: { self_check_in_enabled: false, self_check_in_verify: "name", self_check_in_print: false, has_pin: true },
  counters: { registered: 120, checked_in: 64, checked_in_here: 21 },
  agenda: [],
  has_programme: false,
};

const matched: RedeemResult = {
  outcome: "MATCHED",
  guest: { id: "r1", first_name: "Ananya", display_name: "Ananya Iyer", role: "speaker", role_label: "Speaker", ticket_id: "MOA-1", already_checked_in: false, has_card: false, may_print: true },
  other_event: null,
  redemption_token: "rt_1",
  print_url: null,
  auto_print: false,
};

const api = vi.hoisted(() => ({
  context: vi.fn(),
  redeem: vi.fn(),
  staff: vi.fn(),
  kiosks: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    fetchKioskContext: api.context,
    redeemAtKiosk: api.redeem,
    kioskStaff: api.staff,
    fetchKiosks: api.kiosks,
    fetchKioskSettings: api.settings,
  };
});

// Node's own localStorage shadows jsdom's and has no backing file here; the screens read through a plain one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { render } = await import("@/test/render");
const { KioskApp } = await import("./components/kiosk-app");
const { KiosksPanel } = await import("./components/kiosks-panel");
const { KIOSK_TOKEN_STORAGE } = await import("./api");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.context.mockResolvedValue(ctx);
});

describe("the kiosk", () => {
  it("says it is not paired, on the dark scale, when it has no token", () => {
    const { container } = render(<KioskApp />);
    expect(screen.getByRole("heading", { name: "This kiosk is not paired" })).toBeInTheDocument();
    expect(container.querySelector(".dark")).not.toBeNull();
  });

  it("opens on the scanner with the event, the door and the count", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    render(<KioskApp />);
    expect(await screen.findByRole("heading", { name: "Scan your ticket" })).toBeInTheDocument();
    expect(screen.getByText("Hack Night 04")).toBeInTheDocument();
    expect(screen.getByText("Edge AI Club · Lobby kiosk")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("/ 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start camera/ })).toBeInTheDocument();
    expect(api.context).toHaveBeenCalledWith("kiosk_tok");
  });

  it("welcomes a guest by name after a typed code, with a way to take it back", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.redeem.mockResolvedValue(matched);
    render(<KioskApp />);
    fireEvent.change(await screen.findByLabelText("Ticket code"), { target: { value: "MOA-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByRole("heading", { name: "Welcome in, Ananya." })).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /This isn.t me \(60s\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done · back in 25s/ })).toBeInTheDocument();
    expect(api.redeem).toHaveBeenCalledWith("kiosk_tok", "MOA-1", expect.any(String));
  });

  it("refuses a ticket for another event and names it", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.redeem.mockResolvedValue({ ...matched, outcome: "WRONG_EVENT", guest: null, other_event: { name: "Demo Day" } });
    render(<KioskApp />);
    fireEvent.change(await screen.findByLabelText("Ticket code"), { target: { value: "MOA-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByRole("heading", { name: "That ticket is for another event." })).toBeInTheDocument();
    expect(screen.getByText("Wrong event")).toBeInTheDocument();
    expect(screen.getByText("It is a valid ticket for Demo Day.")).toBeInTheDocument();
  });

  it("opens staff mode behind the PIN", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.staff.mockResolvedValue({ ok: true, device: { name: "Lobby tablet", door: "Lobby kiosk" }, printed_today: 9, checked_in_here: 21, counters: { registered: 120, checked_in: 64 } });
    render(<KioskApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Staff/ }));
    const pin = within(screen.getByRole("dialog", { name: "Staff mode" }));
    fireEvent.change(pin.getByLabelText("Event PIN"), { target: { value: "4321" } });
    fireEvent.click(pin.getByRole("button", { name: "Open" }));
    const panel = within(await screen.findByRole("dialog", { name: "Lobby tablet" }));
    expect(panel.getByText("Cards printed today")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /Unpair this kiosk/ })).toBeInTheDocument();
    expect(api.staff).toHaveBeenCalledWith("kiosk_tok", "4321");
  });
});

describe("the kiosks panel", () => {
  it("lists the paired tablets and the form to pair one", async () => {
    api.kiosks.mockResolvedValue([{ id: "k1", event_id: 37, name: "Lobby tablet", door_label: "Lobby kiosk", token_prefix: "jTCuFS", expires_at: "2026-10-17T00:00:00Z", last_seen_at: null, revoked_at: null, online: true, active: true, created_at: null }]);
    api.settings.mockResolvedValue({ self_check_in_enabled: true, self_check_in_verify: "email", self_check_in_print: false, has_pin: true });
    render(<KiosksPanel eventId={37} doors={[]} />);
    expect(await screen.findByText("Lobby tablet")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpair Lobby tablet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pair a kiosk/ })).toBeDisabled();
    expect(await screen.findByRole("radio", { name: /Code by email/ })).toHaveAttribute("aria-checked", "true");
  });
});
