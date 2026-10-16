import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import type { SelfSession } from "./api";

const session: SelfSession = {
  session: "s1",
  expires_at: "2026-10-16T14:00:00Z",
  event: { name: "Hack Night 04", venue: null, starts_at: null, org_name: "Edge AI Club", brand_primary: "#1db9a0", kiosk: { name: "Lobby tablet", door: "Lobby kiosk" } },
  verify: "name",
  print: true,
  door_open: true,
};

const api = vi.hoisted(() => ({ start: vi.fn(), lookup: vi.fn(), checkIn: vi.fn(), print: vi.fn() }));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, startSelf: api.start, lookupSelf: api.lookup, checkInSelf: api.checkIn, printSelf: api.print };
});

const { render } = await import("@/test/render");
const { PhoneCheckIn } = await import("./components/phone-check-in");

beforeEach(() => {
  vi.clearAllMocks();
  api.start.mockResolvedValue(session);
});

describe("checking in from a phone", () => {
  it("takes a name, confirms, checks the guest in and offers the card", async () => {
    api.lookup.mockResolvedValue({ outcome: "READY", channel: null, masked: null, checked_in_at: null, door: null });
    api.checkIn.mockResolvedValue({ outcome: "CHECKED_IN", guest: { first_name: "Ananya", display_name: "Ananya Iyer", role_label: "Speaker", ticket_id: "MOA-1" }, can_print: true });
    const { container } = render(<PhoneCheckIn token="tok" />);
    expect(await screen.findByRole("heading", { name: "Hack Night 04" })).toBeInTheDocument();
    const root = container.querySelector<HTMLElement>('[data-slot="self-check-in"]')!;
    expect(root).toHaveClass("dark");
    expect(root.style.getPropertyValue("--brand")).toBe("#1db9a0");
    expect(screen.getByText("Checking in at Lobby tablet")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your name, as it is on your ticket"), { target: { value: "Ananya Iyer" } });
    fireEvent.click(continueButton);
    fireEvent.click(await screen.findByRole("button", { name: "Check me in" }));
    expect(await screen.findByText("Welcome, Ananya.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print my card/ })).toBeInTheDocument();
    expect(api.lookup).toHaveBeenCalledWith("s1", "Ananya Iyer", undefined);
  });

  it("says when a name is not on the list, and stays on the name step", async () => {
    api.lookup.mockResolvedValue({ outcome: "NOT_FOUND", channel: null, masked: null, checked_in_at: null, door: null });
    render(<PhoneCheckIn token="tok" />);
    fireEvent.change(await screen.findByLabelText("Your name, as it is on your ticket"), { target: { value: "Nobody Here" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that name on the list.");
    expect(screen.getByLabelText("Your name, as it is on your ticket")).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    api.start.mockRejectedValue(new Error("This check-in link has expired. Scan the QR on the kiosk again."));
    render(<PhoneCheckIn token="old" />);
    expect(await screen.findByText("This link has expired")).toBeInTheDocument();
    expect(screen.getByText(/Scan the QR on the kiosk again/)).toBeInTheDocument();
  });
});
