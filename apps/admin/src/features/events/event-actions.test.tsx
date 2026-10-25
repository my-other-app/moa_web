import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import analyticsFixture from "../__fixtures__/event-analytics-admin.json";
import detailFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/event-registrations-admin.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Deleting and editing an event from its admin page.
 *
 * Delete: the API refuses an event anyone has registered for, so the page
 * says that up front and does not offer the button rather than letting the
 * admin find out from an error. Edit: the update handler assigns what it
 * receives, so the form sends every field (the multipart payload itself is
 * pinned in critical-surfaces.test.ts).
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let refuse: Error | null = null;
let analytics: Record<string, unknown> = analyticsFixture;

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    // An owner, whose role may delete and edit (event-detail.test.tsx covers the others).
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: "owner" } }),
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/analytics")) return analytics;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        if (path.includes("/events/info/")) return detailFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (refuse) throw refuse;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (refuse) throw refuse;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { EventDetail } = await import("./components/event-detail");

const writes = () => calls.filter((c) => c.method !== "GET");
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  analytics = { ...analyticsFixture, total_registrations: 0 };
  nav.replace.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

async function openPage() {
  render(<EventDetail eventId={37} />);
  await screen.findByRole("heading", { name: "SF Sea Hackathon" });
  // The confirmation reads the registration count from the analytics, so
  // wait for them (the attendance rate is drawn from the same response).
  await screen.findByText("75%");
}

async function askToDelete() {
  await openPage();
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  return screen.findByRole("alertdialog");
}

describe("delete an event", () => {
  it("confirms with what it removes; cancelling sends nothing", async () => {
    const confirm = await askToDelete();
    expect(within(confirm).getByText("Delete “SF Sea Hackathon”?")).toBeInTheDocument();
    expect(within(confirm).getByText(/cannot be undone from here/i)).toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(writes()).toEqual([]);
  });

  it("will not delete an event people have registered for, and says why", async () => {
    analytics = { ...analyticsFixture, total_registrations: 24 };
    await openPage();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    const confirm = await screen.findByRole("alertdialog");

    expect(within(confirm).getByText("24 people have")).toBeInTheDocument();
    expect(within(confirm).getByText(/so this will be rejected/i)).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Delete event" })).toBeDisabled();
  });

  it("deletes by id, says so and goes back to the events list", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete event" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/events"));
    expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/events/delete/37" }]);
    expect(success).toHaveBeenCalledWith("Event deleted");
  });

  it("stays on the event and says why when the server refuses", async () => {
    refuse = new Error("Cannot delete an event with registrations");
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete event" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Cannot delete an event with registrations"));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});

describe("edit an event", () => {
  async function openEdit() {
    await openPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Edit" }), { button: 0, ctrlKey: false });
    return screen.findByRole("tabpanel", { name: "Edit" });
  }

  const sent = () => {
    const put = writes().find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/v1/events/update/37");
    return Object.fromEntries((put!.body as FormData).entries());
  };

  it("starts from the event as it is", async () => {
    const panel = await openEdit();
    expect(within(panel).getByLabelText("Name")).toHaveValue("SF Sea Hackathon");
    expect(within(panel).getByLabelText("Starts")).toHaveValue("2026-06-09T08:20");
    expect(within(panel).getByLabelText("Registration closes")).toHaveValue("2026-06-01T00:00");
    expect(within(panel).getByLabelText("Location")).toHaveValue("Honam area");
    expect(within(panel).getByLabelText("Maximum participants")).toHaveValue(100);
    expect(within(panel).getByText(/does not notify anyone who has registered/i)).toBeInTheDocument();
  });

  it("sends every field, changed or not, and says it is saved", async () => {
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Location"), { target: { value: "Main Hall" } });
    fireEvent.change(within(panel).getByLabelText("Starts"), { target: { value: "2026-06-10T09:00" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Event updated"));
    expect(sent()).toEqual({
      name: "SF Sea Hackathon",
      about: "A 48-hour hackathon.",
      location_name: "Main Hall",
      event_datetime: "2026-06-10T09:00",
      reg_enddate: "2026-06-01T00:00",
      max_participants: "100",
      contact_email: "organiser@example.com",
      contact_phone: "9000000000",
    });
  });

  it("sends an emptied cap as 0, which the API reads as no limit", async () => {
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Maximum participants"), { target: { value: "" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().max_participants).toBe("0");
  });

  it("will not save without a name of three characters and a start time", async () => {
    const panel = await openEdit();
    const save = within(panel).getByRole("button", { name: "Save changes" });
    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "SF" } });
    expect(save).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "SF Sea" } });
    fireEvent.change(within(panel).getByLabelText("Starts"), { target: { value: "" } });
    expect(save).toBeDisabled();
    expect(writes()).toEqual([]);
  });

  it("says why when the server refuses and keeps the edits", async () => {
    refuse = new Error("Registration must close before the event starts");
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Registration closes"), { target: { value: "2026-07-01T00:00" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Registration must close before the event starts"));
    expect(success).not.toHaveBeenCalled();
    expect(within(panel).getByLabelText("Registration closes")).toHaveValue("2026-07-01T00:00");
  });
});
