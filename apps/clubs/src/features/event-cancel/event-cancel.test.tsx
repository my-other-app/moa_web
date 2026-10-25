import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Cancelling an event people registered for: the counts of what it does,
 * a reason and an explicit yes; the counts go back with the request and a
 * stale preview is shown again; afterwards the refunds' progress and the
 * ones to try again. On the event's page the action, the Payments and
 * Results tabs and the Cancelled status follow what the backend has.
 */
const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
let me: unknown = null;
let server: "old" | "new" = "new";
let state: Record<string, unknown>;
let onCancel: (body: Record<string, unknown>) => unknown;
let summaryStatus = "live";
const pathname = { current: "/events/37" };

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => pathname.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

const before = () => ({
  status: "live", cancelled: false, reason: null, cancelled_at: null, cancelled_by: null, can_cancel: true, blocked_reason: null,
  registrations: 24, paid_online: 3, refund_total: 1500, paid_at_door: 1, paid_at_door_total: 500,
  refunds: { total: 0, succeeded: 0, pending: 0, failed: 0, refunded_amount: 0 }, failures: [], notice: null,
});
const after = (over: Record<string, unknown> = {}) => ({
  ...before(), status: "cancelled", cancelled: true, can_cancel: false, reason: "Venue flooded", cancelled_at: "2026-10-25T10:00:00+00:00", cancelled_by: "Circuit Society",
  refunds: { total: 3, succeeded: 2, pending: 0, failed: 1, refunded_amount: 1000 },
  failures: [{ id: "rf-9", registration_id: "r-9", full_name: "Mia", email: "mia@example.com", amount: 500, error: "Payment too old", attempts: 2, gateway: "club" }],
  notice: { email_message_id: "m-1", push_sent: 11, whatsapp_sent: 4, whatsapp_skipped: 1 },
  ...over,
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        if (path.includes("/events/info/")) return { ...eventFixture, has_fee: true };
        if (/\/events\/\d+\/summary$/.test(path)) return { ...summaryFixture, status: summaryStatus };
        if (path === "/api/v1/events/37/cancel" || path === "/api/v1/events/37/results") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          if (path.endsWith("/results")) return { event_id: 37, has_competition: false, tracks: [], winners: [] };
          return state;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/37/cancel") return onCancel(body);
        if (path === "/api/v1/events/37/cancel/retry") return after({ refunds: { total: 3, succeeded: 3, pending: 0, failed: 0, refunded_amount: 1500 }, failures: [] });
        if (path === "/api/v1/events/37/refunds/rf-9/retry") {
          return {
            refund: { id: "rf-9", amount: 500, reason: "", status: "succeeded", source: "cancellation", error: null, created_at: null, by: null },
            payment: { id: "pl-9", registration_id: "r-9", ticket_id: null, guest_name: "Mia", guest_email: null, amount: 500, refunded: 500, refundable: 0, method: "upi", status: "refunded", paid_at: null, gateway: "club", refunds: [] },
          };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { CancelEventDialog, CancellationPanel } = await import("./index");
const { EventConsole } = await import("@/features/console");
const { signalOf } = await import("@/features/events/components/events-list");

beforeEach(() => {
  calls.length = 0;
  me = null;
  server = "new";
  summaryStatus = "live";
  state = before();
  onCancel = () => after();
  vi.restoreAllMocks();
});

const posts = () => calls.filter((c) => c.method === "POST");

describe("the cancel dialog", () => {
  function open() {
    render(<CancelEventDialog eventId={37} eventName="SF Sea Hackathon" open onOpenChange={() => undefined} />);
    return screen.findByRole("list", { name: "What cancelling does" });
  }

  it("says what cancelling does, in the server's counts", async () => {
    const list = await open();
    expect(list).toHaveTextContent("24 registered guests are told");
    expect(list).toHaveTextContent("3 online payments refunded in full");
    expect(list).toHaveTextContent("1,500");
    expect(list).toHaveTextContent("1 guest paid at the door");
    expect(list).toHaveTextContent("can't be undone");
  });

  it("needs a reason and an explicit yes, then sends the counts it showed", async () => {
    const success = vi.spyOn(toast, "success");
    await open();
    const go = screen.getByRole("button", { name: "Cancel the event" });
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand this can't be undone" }));
    fireEvent.click(go);
    expect(await screen.findByText("Say why, in a sentence. Guests see it.")).toBeInTheDocument();
    expect(posts()).toEqual([]);
    fireEvent.change(screen.getByLabelText(/Why it's cancelled/), { target: { value: "  Venue flooded  " } });
    fireEvent.click(go);
    await waitFor(() =>
      expect(posts()).toEqual([
        { method: "POST", path: "/api/v1/events/37/cancel", body: { reason: "Venue flooded", expected_registrations: 24, expected_refund_total: 1500 } },
      ]),
    );
    await waitFor(() => expect(success).toHaveBeenCalledWith("Event cancelled. Guests are being told, and their payments are on the way back."));
  });

  it("shows the numbers again when they changed meanwhile, and asks for the yes again", async () => {
    onCancel = () => {
      state = { ...before(), registrations: 25, refund_total: 2000, paid_online: 4 };
      throw new ApiError({ status: 409, message: "The numbers changed", errorCode: "CANCEL_PREVIEW_STALE" });
    };
    await open();
    fireEvent.change(screen.getByLabelText(/Why it's cancelled/), { target: { value: "Venue flooded" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand this can't be undone" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel the event" }));
    expect(await screen.findByText(/Something changed since you opened this/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("list", { name: "What cancelling does" })).toHaveTextContent("25 registered guests are told"));
    expect(screen.getByRole("checkbox", { name: "I understand this can't be undone" })).not.toBeChecked();
  });

  it("says why an event can't be cancelled, and offers nothing to press", async () => {
    state = { ...before(), can_cancel: false, blocked_reason: "An archived event can't be cancelled." };
    render(<CancelEventDialog eventId={37} eventName="SF Sea Hackathon" open onOpenChange={() => undefined} />);
    expect(await screen.findByText("An archived event can't be cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel the event" })).not.toBeInTheDocument();
  });
});

describe("after cancelling", () => {
  it("shows the reason, who was told, the refunds' progress and the cash to give back by hand", async () => {
    state = after();
    render(<CancellationPanel eventId={37} />);
    expect(await screen.findByText("This event was cancelled")).toBeInTheDocument();
    expect(screen.getByText(/Venue flooded/)).toBeInTheDocument();
    expect(screen.getByText(/24 guests by email, 11 in the app, 4 on WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 refunded/)).toBeInTheDocument();
    expect(screen.getByText(/paid at the door/)).toBeInTheDocument();
    const failed = screen.getByRole("list", { name: "Refunds that failed" });
    expect(within(failed).getByText(/Payment too old/)).toBeInTheDocument();
  });

  it("tries every failed refund again, or one", async () => {
    state = after();
    render(<CancellationPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try the refund to Mia again" }));
    await waitFor(() => expect(posts().map((p) => p.path)).toEqual(["/api/v1/events/37/refunds/rf-9/retry"]));
    fireEvent.click(screen.getByRole("button", { name: /Try all again/ }));
    await waitFor(() => expect(posts().map((p) => p.path)).toContain("/api/v1/events/37/cancel/retry"));
  });

  it("is nothing for an event that isn't cancelled", async () => {
    const { container } = render(<CancellationPanel eventId={37} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/cancel")).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("on the event's page", () => {
  const console = () =>
    render(
      <EventConsole eventId={37}>
        <p>the panel</p>
      </EventConsole>,
    );

  it("offers Cancel, Payments and Results once the backend has them", async () => {
    console();
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    expect(await within(rail).findByRole("link", { name: /Results/ })).toHaveAttribute("href", "/events/37/results");
    expect(await within(rail).findByRole("link", { name: /Payments/ })).toHaveAttribute("href", "/events/37/payments");
    // Asked once the backend answered: the item is there only then.
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/cancel")).toBe(true));
    fireEvent.keyDown(await screen.findByRole("button", { name: "More for SF Sea Hackathon" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Cancel event/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cancel “SF Sea Hackathon”?");
  });

  it("offers none of it on a backend without them", async () => {
    server = "old";
    console();
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/cancel")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(within(rail).queryByRole("link", { name: /Results/ })).toBeNull();
    expect(within(rail).queryByRole("link", { name: /Payments/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "More for SF Sea Hackathon" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Edit details/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Cancel event/ })).toBeNull();
  });

  it("keeps Cancel and Payments from roles without money", async () => {
    me = {
      role: "editor", role_label: "Editor", role_description: "", club_id: 5, club_name: "Circuit Society", member: null,
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true },
    };
    console();
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));
    await within(rail).findByRole("link", { name: /Results/ });
    expect(within(rail).queryByRole("link", { name: /Payments/ })).toBeNull();
  });

  it("says Cancelled, and points the owner to the refunds", async () => {
    summaryStatus = "cancelled";
    state = after();
    console();
    expect((await screen.findAllByText("Cancelled")).some((el) => el.getAttribute("data-slot") === "badge")).toBe(true);
    expect(screen.getByText(/Cancelled\. Registrations are closed, every guest was told/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Refunds and notices" })).toHaveAttribute("href", "/events/37/payments");
  });

  it("reads a cancelled event's row as cancelled in the list", () => {
    const row = { id: 37, name: "x", status: "cancelled", door_open: false, registration_count: 3 } as unknown as Parameters<typeof signalOf>[0];
    expect(signalOf(row)).toEqual({ text: "Cancelled — guests told", tone: "refuse" });
  });
});
