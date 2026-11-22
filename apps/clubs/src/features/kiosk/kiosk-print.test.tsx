import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { KioskContext, RedeemResult } from "./schemas";

const ctx: KioskContext = {
  device: { id: "k1", name: "Lobby tablet", door: "Lobby kiosk", expires_at: "2026-11-29T00:00:00Z" },
  event: { id: 37, name: "DevFest", org_name: "GDG", venue: null, starts_at: null, brand_primary: "#e4572e", poster_url: null, door_open: true, reprint_policy: "anyone", auto_print_badges: false, has_fee: false },
  self_check_in: { self_check_in_enabled: false, self_check_in_verify: "name", self_check_in_print: false, has_pin: true },
  counters: { registered: 120, checked_in: 64, checked_in_here: 21 },
  agenda: [],
  has_programme: false,
  printers: { online: 1 },
};
const matched: RedeemResult = {
  outcome: "MATCHED",
  guest: { id: "r1", first_name: "Asha", display_name: "Asha K", role: "attendee", role_label: "Attendee", ticket_id: "MOA-1", already_checked_in: false, has_card: false, may_print: true },
  other_event: null,
  redemption_token: "rt_1",
  print_url: "/api/v1/kiosk/card.pdf?redemption=rt_1",
  auto_print: false,
};
const req = (status: string, extra: Record<string, unknown> = {}) => ({ id: "pr1", registration_id: "r1", name: "Asha K", ticket_code: "MOA-1", source: "kiosk", status, attempts: 1, printer: null, error: null, created_at: null, printed_at: null, position: null, ...extra });

const api = vi.hoisted(() => ({ context: vi.fn(), redeem: vi.fn(), create: vi.fn(), poll: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchKioskContext: api.context, redeemAtKiosk: api.redeem, createKioskPrintRequest: api.create, fetchKioskPrintRequest: api.poll };
});
const frames = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@/features/idcards", () => ({ PrintFrame: ({ url }: { url: string }) => (frames.urls.push(url), null) }));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() });

const { render } = await import("@/test/render");
const { KioskApp } = await import("./components/kiosk-app");
const { KIOSK_TOKEN_STORAGE } = await import("./api");

async function admit() {
  store.set(KIOSK_TOKEN_STORAGE, "kiosk_tok");
  render(<KioskApp />);
  fireEvent.change(await screen.findByLabelText("Ticket code"), { target: { value: "MOA-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
  await screen.findByRole("heading", { name: "Welcome in, Asha." });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  frames.urls.length = 0;
  api.context.mockResolvedValue(ctx);
  api.redeem.mockResolvedValue(matched);
  api.poll.mockResolvedValue(req("queued", { position: 1 }));
});

describe("the kiosk with a print station online", () => {
  it("offers Print my ID card after an admission, and asks the station with the redemption", async () => {
    api.create.mockResolvedValue(req("queued", { position: 3 }));
    api.poll.mockResolvedValue(req("queued", { position: 3 }));
    await admit();
    fireEvent.click(screen.getByRole("button", { name: /Print my ID card/ }));
    expect(api.create).toHaveBeenCalledWith("kiosk_tok", { redemption: "rt_1" });
    expect(await screen.findByText("In the queue (2 ahead)")).toBeInTheDocument();
    // The tablet itself prints nothing.
    expect(frames.urls).toEqual([]);
    expect(screen.queryByRole("button", { name: /Print my card/ })).toBeNull();
  });

  it("follows the request: printing, then printed with the way to the desk, and heads back in 8 seconds", async () => {
    api.create.mockResolvedValue(req("queued", { position: 1 }));
    await admit();
    fireEvent.click(screen.getByRole("button", { name: /Print my ID card/ }));
    expect(await screen.findByText("You are next in the queue")).toBeInTheDocument();
    api.poll.mockResolvedValue(req("printing"));
    expect(await screen.findByText("Printing…", {}, { timeout: 4000 })).toBeInTheDocument();
    api.poll.mockResolvedValue(req("printed", { printed_at: "2026-11-28T10:00:00Z" }));
    expect(await screen.findByText("Printed — collect your card at the desk", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done · back in 8s/ })).toBeInTheDocument();
  });

  it("says a failure in plain words with Ask at the desk", async () => {
    api.create.mockResolvedValue(req("queued", { position: 1 }));
    api.poll.mockResolvedValue(req("failed", { error: "The printer is out of paper." }));
    await admit();
    fireEvent.click(screen.getByRole("button", { name: /Print my ID card/ }));
    expect(await screen.findByText("The printer is out of paper. Ask at the desk.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done · back in 8s/ })).toBeInTheDocument();
  });

  it("shows the rule's words when a second card is refused, with no retry", async () => {
    api.create.mockRejectedValue(new ApiError({ message: "Your card was already printed. Ask at the desk.", status: 409, errorCode: "REPRINT_NOT_ALLOWED" }));
    await admit();
    fireEvent.click(screen.getByRole("button", { name: /Print my ID card/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was already printed. Ask at the desk.");
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("sends the card on its own when the event prints at admission, and shows the status", async () => {
    api.redeem.mockResolvedValue({ ...matched, auto_print: true });
    api.create.mockResolvedValue(req("queued", { position: 1 }));
    await admit();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("kiosk_tok", { redemption: "rt_1" }));
    expect(screen.queryByRole("button", { name: /Print my ID card/ })).toBeNull();
    expect(await screen.findByText("You are next in the queue")).toBeInTheDocument();
    expect(frames.urls).toEqual([]);
  });
});

describe("the kiosk with no print station online", () => {
  it("keeps today's behaviour: the tablet's own Print my card, no station request", async () => {
    api.context.mockResolvedValue({ ...ctx, printers: { online: 0 } });
    await admit();
    expect(screen.queryByRole("button", { name: /Print my ID card/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Print my card" }));
    expect(frames.urls).toEqual(["/api/gateway/api/v1/kiosk/card.pdf?redemption=rt_1"]);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("prints at admission on the tablet, as before, when auto-print is on", async () => {
    api.context.mockResolvedValue({ ...ctx, printers: null });
    api.redeem.mockResolvedValue({ ...matched, auto_print: true });
    await admit();
    expect(frames.urls).toEqual(["/api/gateway/api/v1/kiosk/card.pdf?redemption=rt_1"]);
    expect(api.create).not.toHaveBeenCalled();
  });
});
