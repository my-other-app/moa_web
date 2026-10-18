import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { KioskContext, RedeemResult } from "./schemas";

const ctx: KioskContext = {
  device: { id: "k1", name: "Lobby tablet", door: "Lobby kiosk", expires_at: "2026-10-17T00:00:00Z" },
  event: { id: 37, name: "Hack Night 04", org_name: "Edge AI Club", venue: null, starts_at: null, brand_primary: "#e4572e", poster_url: null, door_open: true, reprint_policy: "anyone", auto_print_badges: false, has_fee: false },
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
  update: vi.fn(),
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
    updateKioskSettings: api.update,
  };
});

// Node's own localStorage shadows jsdom's and has no backing file here; the screens read through a plain one.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
vi.stubGlobal("localStorage", localStorageStub);

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

  it("carries the event's own colour as the brand, and keeps verdicts in their tones", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.redeem.mockResolvedValue({ ...matched, outcome: "UNPAID", guest: null });
    const { container } = render(<KioskApp />);
    await screen.findByRole("heading", { name: "Scan your ticket" });
    const root = container.querySelector<HTMLElement>('[data-slot="kiosk"]')!;
    expect(root.style.getPropertyValue("--brand")).toBe("#e4572e");
    expect(root.style.getPropertyValue("--brand-soft")).toContain("#e4572e");
    expect(root.style.getPropertyValue("--brand-foreground")).toBe("var(--canvas)");
    fireEvent.change(screen.getByLabelText("Ticket code"), { target: { value: "MOA-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect((await screen.findByText("Not paid")).className).toContain("text-refuse");
  });

  it("falls back to Meridian's brand when the event has no usable colour", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.context.mockResolvedValue({ ...ctx, event: { ...ctx.event, brand_primary: "teal" } });
    const { container } = render(<KioskApp />);
    await screen.findByRole("heading", { name: "Scan your ticket" });
    expect(container.querySelector<HTMLElement>('[data-slot="kiosk"]')!.style.getPropertyValue("--brand")).toBe("");
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

  it("sends a guest who typed an unknown code -- an admission number, say -- to the ticket code or the desk", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.redeem.mockResolvedValue({ ...matched, outcome: "NO_MATCH", guest: null, redemption_token: null });
    render(<KioskApp />);
    const field = await screen.findByLabelText("Ticket code");
    expect(field).toHaveAttribute("placeholder", "Or type your ticket code (MOA-XXXXX-XXXXX)");
    fireEvent.change(field, { target: { value: "MOA-0042-E123" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByRole("heading", { name: "That code was not recognised." })).toBeInTheDocument();
    expect(screen.getByText(/ticket code printed under the QR .*not the admission number.*desk/)).toBeInTheDocument();
  });

  it("prints the card it just admitted with the device token in a header, not the link", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    const fetchSpy = vi.fn(async () => new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    api.redeem.mockResolvedValue({ ...matched, auto_print: true, print_url: "/api/v1/kiosk/card.pdf?redemption=rt_1.abcdefghij" });
    try {
      render(<KioskApp />);
      fireEvent.change(await screen.findByLabelText("Ticket code"), { target: { value: "MOA-ABCDE-23456" } });
      fireEvent.click(screen.getByRole("button", { name: "Check in" }));
      expect(await screen.findByText("Printing your card…")).toBeInTheDocument();
      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/gateway/api/v1/kiosk/card.pdf?redemption=rt_1.abcdefghij");
      expect(url).not.toContain("token=");
      expect((init.headers as Record<string, string>)["X-Kiosk-Token"]).toBe("kiosk_tok");
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", localStorageStub);
    }
  });

  it("says a kiosk locked by wrong PINs plainly, in the PIN dialog", async () => {
    localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
    api.staff.mockRejectedValue(new ApiError({ message: "Too many wrong PINs on this kiosk. Try again in a few minutes.", status: 429, errorCode: "PIN_LOCKED" }));
    render(<KioskApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Staff/ }));
    const pin = within(screen.getByRole("dialog", { name: "Staff mode" }));
    fireEvent.change(pin.getByLabelText("Event PIN"), { target: { value: "0000" } });
    fireEvent.click(pin.getByRole("button", { name: "Open" }));
    expect(await pin.findByRole("alert")).toHaveTextContent("Too many tries, wait 15 minutes.");
    expect(screen.queryByRole("dialog", { name: "Lobby tablet" })).toBeNull();
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

  it("will not send a PIN shorter than four, and shows the API's word when it refuses one", async () => {
    api.kiosks.mockResolvedValue([]);
    api.settings.mockResolvedValue({ self_check_in_enabled: false, self_check_in_verify: "email", self_check_in_print: false, has_pin: false });
    api.update.mockRejectedValue(new ApiError({ message: "A PIN of four characters or more.", status: 422, fieldErrors: { fields: { kiosk_pin: "Four characters or more." } } as unknown as Record<string, string[]> }));
    render(<KiosksPanel eventId={37} doors={[]} />);
    const field = await screen.findByPlaceholderText("4 to 12 digits");
    fireEvent.change(field, { target: { value: "12" } });
    expect(screen.getByText("A PIN of 4 digits or more.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set PIN" })).toBeDisabled();
    fireEvent.submit(field.closest("form")!);
    expect(api.update).not.toHaveBeenCalled();
    // A server that refuses one anyway is heard under the field, not only in a toast.
    fireEvent.change(field, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Set PIN" }));
    expect(await screen.findByText("Four characters or more.")).toBeInTheDocument();
  });
});
