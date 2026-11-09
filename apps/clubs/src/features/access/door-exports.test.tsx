import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { exportChoices } from "@/test/export-menu";

import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Door staff check people in: they see names at the gate, not a list to
 * take away, and never the discount codes (one can make a ticket free). The
 * server refuses them those; the dashboard does not offer them either. An
 * editor, who may, still sees every export.
 */
const DOOR_CAN = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: false, delete_events: false, door: true };
const EDITOR_CAN = { ...DOOR_CAN, edit_events: true };
const me = (role: "door" | "editor") => ({
  role,
  role_label: role === "door" ? "Door" : "Editor",
  role_description: "",
  can: role === "door" ? DOOR_CAN : EDITOR_CAN,
  club_id: 5,
  club_name: "Circuit Society",
  member: null,
});
const state: { me: ReturnType<typeof me> } = { me: me("door") };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/access/me")) return state.me;
        if (path.includes("/events/info/")) return eventFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/ticketing/types")) return { types: [], follows_event: true, event_capacity: null, event_available: null };
        if (path.endsWith("/ticketing/waitlist")) return { items: [], counts: {}, total: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { capsSchema, OWNER_CAN } = await import("./schemas");
const { blockedBy } = await import("./components/route-gate");
const { RegistrationsPanel } = await import("@/features/registrations/components/registrations-panel");
const { TicketsPage } = await import("@/features/ticketing/components/tickets-page");
const { WaitlistPanel } = await import("@/features/ticketing/components/waitlist-panel");

beforeEach(() => {
  state.me = me("door");
});

describe("what a role may take away", () => {
  it("gives door staff no exports, on any server", () => {
    expect(capsSchema.parse(DOOR_CAN).exports).toBe(false);
    expect(capsSchema.parse({ ...DOOR_CAN, contacts: false }).exports).toBe(false);
    expect(capsSchema.parse(EDITOR_CAN).exports).toBe(true);
    // The server's own word on the contact book, never door staff's, decides it when sent.
    expect(capsSchema.parse({ ...EDITOR_CAN, contacts: true }).exports).toBe(true);
    expect(OWNER_CAN.exports).toBe(true);
  });

  it("closes the discount codes page to door staff, as the rail already leaves it out", () => {
    expect(blockedBy("/discount-codes", capsSchema.parse(DOOR_CAN))?.what).toBe("discount codes");
    expect(blockedBy("/discount-codes", capsSchema.parse(EDITOR_CAN))).toBeNull();
    expect(blockedBy("/followers", capsSchema.parse(DOOR_CAN))).not.toBeNull();
  });
});

describe("the guest list's Export", () => {
  it("is not offered to door staff", async () => {
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("heading", { name: "Attendees" })).toBeInTheDocument();
    // Once the role is known, the link is gone (it is shown while the role is still being asked).
    await waitFor(() => expect(screen.queryByRole("link", { name: /Export.*to Excel/ })).toBeNull());
  });

  it("is offered to an editor", async () => {
    state.me = me("editor");
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("link", { name: /Export.*to Excel/ })).toHaveAttribute("href", expect.stringContaining("/export"));
  });
});

describe("the Tickets tab", () => {
  it("shows door staff neither the waiting list's Export nor the discount codes", async () => {
    render(<TicketsPage eventId={37} />);
    expect(await screen.findByText("Waiting list")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("This event's discount codes")).toBeNull());
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  it("shows an editor both", async () => {
    state.me = me("editor");
    render(<TicketsPage eventId={37} />);
    expect(await screen.findByText("This event's discount codes")).toBeInTheDocument();
    const { xlsx, csv } = await exportChoices("Export");
    expect(xlsx).toHaveAttribute("href", "/api/gateway/api/v1/events/37/ticketing/waitlist/export?format=xlsx");
    expect(csv).toHaveAttribute("href", "/api/gateway/api/v1/events/37/ticketing/waitlist/export");
  });

  it("keeps the waiting list's Export from door staff wherever the panel is drawn", async () => {
    render(<WaitlistPanel eventId={37} />);
    expect(await screen.findByText("Waiting list")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Export" })).toBeNull());
  });
});
