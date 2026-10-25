import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Deleting an event takes every guest's ticket with it, so the menu asks
 * first, says how many people are affected, and only a delete the server
 * accepted moves the page or drops the row.
 */
const calls: Array<{ method: string; path: string }> = [];
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const DAY = 86_400_000;

const base = { slug: null, poster: null, duration: 3, has_prize: false, prize_amount: null, is_online: false, reg_startdate: iso(-10 * DAY), category: { id: 1, name: "Hackathon" }, merch_enabled: false, swag_enabled: false, attended_count: 0, outstanding: 0, location_name: "Lab 3", has_fee: false, reg_fee: null, page_views: 0, checked_in: 0, max_participants: null, collected: 0, door_open: false, registration_open: true, status: "published" };
const hack = { ...base, id: 68, name: "Hack Night 04", event_datetime: iso(2 * DAY), ends_at: iso(2 * DAY + 3_600_000), reg_enddate: iso(DAY), registration_count: 2 };
const summit = { ...base, id: 69, name: "Annual Summit", event_datetime: iso(20 * DAY), ends_at: iso(20 * DAY + 3_600_000), reg_enddate: iso(19 * DAY), registration_count: 0 };

let rows = [hack, summit];
let me: unknown = null;
let refuse: Error | null = null;
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        }
        if (path.endsWith("/events/figures")) throw new Error("no figures in this test");
        if (path.endsWith("/events/list")) return { items: rows, total: rows.length, limit: 20, offset: 0, next: null };
        if (path === "/api/v1/clubs/entitlements") throw new Error("no plan in this test");
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (refuse) throw refuse;
        const id = Number(path.split("/").pop());
        rows = rows.filter((r) => r.id !== id);
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { ClubEventsList } = await import("./components/events-list");
const { EventRowMenu } = await import("./components/event-row-menu");

const openMenu = async (name: string) => {
  fireEvent.keyDown(await screen.findByRole("button", { name: `More for ${name}` }), { key: "Enter" });
};

beforeEach(() => {
  calls.length = 0;
  rows = [hack, summit];
  me = null;
  refuse = null;
  replace.mockClear();
  vi.restoreAllMocks();
});

describe("deleting an event from the events list", () => {
  it("asks first, naming how many people registered, and sends nothing until confirmed", async () => {
    render(<ClubEventsList />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete “Hack Night 04”?")).toBeInTheDocument();
    expect(within(dialog).getByText("2 people have already registered.")).toBeInTheDocument();
    expect(within(dialog).getByText(/They lose this event and their tickets/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("says plainly that an event nobody registered for is removed from the app", async () => {
    render(<ClubEventsList />);
    await openMenu("Annual Summit");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/This removes the event from the app/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/already registered/)).toBeNull();
  });

  it("keeps the event when the organiser backs out", async () => {
    render(<ClubEventsList />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(screen.getByText("Hack Night 04", { selector: "a" })).toBeInTheDocument();
  });

  it("deletes that event by id, says so, and the list reloads without it", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ClubEventsList />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete event" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Event deleted"));
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([{ method: "DELETE", path: "/api/v1/events/delete/68" }]);
    await waitFor(() => expect(screen.queryByText("Hack Night 04", { selector: "a" })).toBeNull());
    expect(screen.getByText("Annual Summit", { selector: "a" })).toBeInTheDocument();
  });

  it("shows the server's refusal and keeps the row", async () => {
    refuse = new ApiError({ status: 409, message: "This event has paid registrations; refund them first" });
    const said = vi.spyOn(toast, "error");
    render(<ClubEventsList />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete event" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("This event has paid registrations; refund them first"));
    expect(screen.getByText("Hack Night 04", { selector: "a" })).toBeInTheDocument();
  });

  it("is not offered to a team member whose role cannot delete events", async () => {
    me = {
      role: "editor",
      role_label: "Editor",
      role_description: "Runs events",
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true },
      club_id: 1,
      club_name: "TinkerHub",
      member: null,
    };
    render(<ClubEventsList />);
    // Wait for the server to say who is signed in, or the owner default would still show it.
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));
    await openMenu("Hack Night 04");
    expect(await screen.findByRole("menuitem", { name: /Edit details/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: /Delete event/ })).toBeNull());
  });
});

describe("deleting from the event's own console", () => {
  const event = { id: 68, name: "Hack Night 04", slug: "hack-night-04", registration_count: 0 };

  it("leaves the deleted event's page once the server has accepted", async () => {
    const left = vi.fn();
    render(<EventRowMenu event={event} onDeleted={left} />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete event" }));
    await waitFor(() => expect(left).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual(["/api/v1/events/delete/68"]);
  });

  it("stays on the page when the delete is refused", async () => {
    refuse = new ApiError({ status: 403, message: "Only the owner can delete events" });
    const said = vi.spyOn(toast, "error");
    const left = vi.fn();
    render(<EventRowMenu event={event} onDeleted={left} />);
    await openMenu("Hack Night 04");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete event" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Only the owner can delete events"));
    expect(left).not.toHaveBeenCalled();
  });
});
