import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { KioskContext, RedeemResult } from "./schemas";

/**
 * The kiosk's self check-in QR (a guest without their ticket scans it and
 * checks in from their own phone, and the kiosk prints the card they ask
 * for), and the event's programme, cycled on the screen while a card prints.
 */
const AGENDA: KioskContext["agenda"] = [
  { starts_at: "2026-10-16T13:00:00Z", ends_at: "2026-10-16T13:30:00Z", title: "Doors and breakfast", speaker: null, location: "Foyer", parallel: false },
  { starts_at: "2026-10-16T13:30:00Z", ends_at: "2026-10-16T14:15:00Z", title: "Opening keynote", speaker: "Dr Meera Pillai", location: "Hall A", parallel: false },
  { starts_at: "2026-10-16T14:30:00Z", ends_at: null, title: "Hardware lab", speaker: "Arjun Rao", location: "Lab 3", parallel: true },
];

const ctx = (self: Partial<KioskContext["self_check_in"]> = {}, agenda: KioskContext["agenda"] = []): KioskContext => ({
  device: { id: "k1", name: "Lobby tablet", door: "Lobby kiosk", expires_at: "2026-10-17T00:00:00Z" },
  event: { id: 37, name: "Hack Night 04", org_name: "Edge AI Club", venue: null, starts_at: null, brand_primary: "#e4572e", poster_url: null, door_open: true, reprint_policy: "anyone", auto_print_badges: false, has_fee: false },
  self_check_in: { self_check_in_enabled: true, self_check_in_verify: "name", self_check_in_print: true, has_pin: true, ...self },
  counters: { registered: 120, checked_in: 64, checked_in_here: 21 },
  agenda,
  has_programme: agenda.length > 0,
});

const SELF_URL = "https://club-dashboard.myotherapp.in/s/37?t=rot_1";
const selfQr = (over: Record<string, unknown> = {}) => ({ enabled: true, verify: "name", print: true, url: SELF_URL, expires_at: "2026-10-16T14:00:00Z", recent: [], ...over });

const api = vi.hoisted(() => ({ context: vi.fn(), selfQr: vi.fn(), printed: vi.fn(), redeem: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchKioskContext: api.context, fetchSelfQr: api.selfQr, markSelfPrinted: api.printed, redeemAtKiosk: api.redeem };
});

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
vi.stubGlobal("localStorage", localStorageStub);
afterAll(() => vi.unstubAllGlobals());

const { render } = await import("@/test/render");
const { KioskApp } = await import("./components/kiosk-app");
const { AgendaCycle } = await import("./components/agenda-cycle");
const { KIOSK_TOKEN_STORAGE } = await import("./api");

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  localStorage.setItem(KIOSK_TOKEN_STORAGE, "kiosk_tok");
  api.context.mockResolvedValue(ctx());
  api.selfQr.mockResolvedValue(selfQr());
  api.printed.mockResolvedValue(undefined);
});

describe("the self check-in QR on the kiosk", () => {
  it("shows a QR of the server's check-in address beside the scanner", async () => {
    render(<KioskApp />);
    const img = await screen.findByAltText("QR code for checking in from your phone");
    expect(img).toHaveAttribute("src", `data:image/png;base64,${btoa(SELF_URL)}`);
    expect(qr.toDataURL).toHaveBeenCalledWith(SELF_URL, { margin: 1, width: 360 });
    expect(api.selfQr).toHaveBeenCalledWith("kiosk_tok");
    const aside = img.closest("aside")!;
    expect(within(aside).getByRole("heading", { name: "No ticket handy?" })).toBeInTheDocument();
    expect(aside).toHaveTextContent("Scan this with your phone and check in with your name.");
  });

  it("says a code will be emailed when the event verifies by email", async () => {
    api.selfQr.mockResolvedValue(selfQr({ verify: "email" }));
    render(<KioskApp />);
    const img = await screen.findByAltText("QR code for checking in from your phone");
    expect(img.closest("aside")).toHaveTextContent("Scan this with your phone and check in with your name and a code we email you.");
  });

  it("shows no QR, and never asks for one, when the event has self check-in off", async () => {
    api.context.mockResolvedValue(ctx({ self_check_in_enabled: false }));
    render(<KioskApp />);
    await screen.findByLabelText("Ticket code");
    expect(screen.queryByAltText("QR code for checking in from your phone")).not.toBeInTheDocument();
    expect(api.selfQr).not.toHaveBeenCalled();
  });

  it("lists who just checked in from their phone, and whose card is printing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    try {
      api.selfQr.mockResolvedValue(selfQr({ recent: [
        { session: "s2", registration_id: "r2", name: "Rahul Nair", at: "2026-10-16T13:05:00Z", print_requested: true },
        { session: "s1", registration_id: "r1", name: "Ananya Iyer", at: "2026-10-16T13:04:00Z", print_requested: false },
      ] }));
      render(<KioskApp />);
      const img = await screen.findByAltText("QR code for checking in from your phone");
      const list = within(img.closest("aside")!).getByRole("list");
      const rows = within(list).getAllByRole("listitem").map((li) => li.textContent);
      expect(rows).toEqual(["Rahul NairPrinting…", "Ananya IyerChecked in"]);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", localStorageStub);
    }
  });

  it("prints the card a phone asked for, with the device token in a header, once, then tells the phone", async () => {
    const pdf = vi.fn(async () => new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", pdf);
    try {
      api.selfQr.mockResolvedValue(selfQr({ recent: [{ session: "s2", registration_id: "r2", name: "Rahul Nair", at: "2026-10-16T13:05:00Z", print_requested: true }] }));
      render(<KioskApp />);
      await waitFor(() => expect(pdf).toHaveBeenCalledTimes(1));
      const [url, init] = pdf.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/gateway/api/v1/kiosk/self-card.pdf?session=s2");
      expect((init.headers as Record<string, string>)["X-Kiosk-Token"]).toBe("kiosk_tok");

      // The PDF is in the frame: it prints, and the phone polling for it is told.
      const frame = (await screen.findByTitle("Print")) as HTMLIFrameElement;
      const print = vi.fn();
      // jsdom implements neither on a frame's window.
      Object.defineProperty(frame.contentWindow!, "print", { value: print, configurable: true });
      Object.defineProperty(frame.contentWindow!, "focus", { value: vi.fn(), configurable: true });
      fireEvent.load(frame);
      expect(print).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(api.printed).toHaveBeenCalledWith("kiosk_tok", "s2"));
      expect(pdf).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", localStorageStub);
    }
  });
});

describe("the programme on the kiosk screen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows one item at a time, in Indian time, and moves to the next after the dwell", () => {
    vi.useFakeTimers();
    render(<AgendaCycle items={AGENDA} dwellMs={3000} />);
    expect(screen.getByText("Doors and breakfast")).toBeInTheDocument();
    expect(screen.getByText("18:30 – 19:00")).toBeInTheDocument();
    expect(screen.getByText("Foyer")).toBeInTheDocument();
    expect(screen.queryByText("Opening keynote")).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("Opening keynote")).toBeInTheDocument();
    expect(screen.getByText("Dr Meera Pillai · Hall A")).toBeInTheDocument();
    expect(screen.queryByText("Doors and breakfast")).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("Hardware lab")).toBeInTheDocument();
    // No end time, and said to run alongside another.
    expect(screen.getByText("20:00 · Parallel")).toBeInTheDocument();

    // Then round again.
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("Doors and breakfast")).toBeInTheDocument();
  });

  it("holds a single item without cycling", () => {
    vi.useFakeTimers();
    render(<AgendaCycle items={AGENDA.slice(1, 2)} dwellMs={3000} />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Opening keynote")).toBeInTheDocument();
  });

  it("draws nothing for an event with no programme", () => {
    const { container } = render(<AgendaCycle items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("runs the programme while a guest's card prints at the kiosk", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    try {
      api.context.mockResolvedValue(ctx({ self_check_in_enabled: false }, AGENDA));
      const matched: RedeemResult = {
        outcome: "MATCHED",
        guest: { id: "r1", first_name: "Ananya", display_name: "Ananya Iyer", role: "attendee", role_label: "Attendee", ticket_id: "MOA-1", already_checked_in: false, has_card: false, may_print: true },
        other_event: null,
        redemption_token: "rt_1",
        print_url: "/api/v1/kiosk/card.pdf?redemption=rt_1.abc",
        auto_print: true,
      };
      api.redeem.mockResolvedValue(matched);
      render(<KioskApp />);
      fireEvent.change(await screen.findByLabelText("Ticket code"), { target: { value: "MOA-1" } });
      fireEvent.click(screen.getByRole("button", { name: "Check in" }));
      expect(await screen.findByText("Printing your card…")).toBeInTheDocument();
      expect(screen.getByText("Doors and breakfast")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", localStorageStub);
    }
  });
});
