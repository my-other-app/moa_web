import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import givenBackFixture from "../__fixtures__/given-back.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";
import { pickExport } from "@/test/export-menu";

/**
 * "Give your ticket back" in the club's dashboard: the event's switch (read
 * from the event, saved with it, and away on a server without it), and the
 * Given back list on the Attendees tab with its export, away on a server
 * without the route. The bell's link to the event's "registrations" lands
 * on that list.
 */

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
/** The event's detail's `allow_self_cancel`; undefined: an older server that doesn't send it. */
let selfCancel: boolean | undefined = true;
/** GET …/cancellations: the rows, or "missing" for an API without the route. */
let givenBack: unknown = givenBackFixture;

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: (to: string) => redirect(to),
    usePathname: () => "/events/37/attendees",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    downloadCsv: vi.fn(),
    downloadXlsx: vi.fn(async () => {}),
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ status: 401, message: "Not signed in" });
        if (path === "/api/v1/events/info/37") return { ...eventFixture, ...(selfCancel === undefined ? {} : { allow_self_cancel: selfCancel }) };
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path === "/api/v1/events/registration/37/cancellations") {
          if (givenBack === "missing") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return givenBack;
        }
        if (path === "/api/v1/events/registration/37/requests") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        if (path.endsWith("/analytics")) return analyticsFixture;
        if (path.endsWith("/list")) return registrationsFixture;
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 2, revoked: 0, channels: [{ channel: "email", sent: 0, failed: 0, skipped: 0, pending: 0, unsent: 2 }] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { id: 37, name: "SF Sea Hackathon" };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { downloadCsv, downloadXlsx, toCsv } = await import("@moa/app-kit");
const { EditEventForm, emptyEventForm, eventFormSchema, toEventFormData } = await import("@/features/event-form");
const { RegistrationsPanel } = await import("@/features/registrations");
const { GivenBackPanel } = await import("./index");
const { alertLink, KIND_INFO } = await import("@/features/club-alerts/schemas");
const { default: RegistrationsRedirect } = await import("@/app/(dashboard)/events/[eventId]/registrations/page");

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };
const sw = () => screen.findByRole("switch", { name: "Attendees can give their ticket back" });
const saved = () => calls.find((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")!.body as FormData;

beforeEach(() => {
  calls.length = 0;
  selfCancel = true;
  givenBack = givenBackFixture;
  redirect.mockClear();
  vi.mocked(downloadCsv).mockClear();
  vi.mocked(downloadXlsx).mockClear();
});

describe("the event's switch", () => {
  it("reads the event's setting, says what it allows, and a save sends the change", async () => {
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).toBeChecked();
    expect(screen.getByText("Their ticket emails carry a link to give it back. Only free tickets, and only before the event starts.")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(saved().get("allow_self_cancel")).toBe("false");
  });

  it("sends what the event had when the club changed something else", async () => {
    selfCancel = false;
    render(<EditEventForm eventId={37} />);
    expect(await sw()).not.toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(saved().get("allow_self_cancel")).toBe("false");
  });

  it("isn't there for an older server, and a save sends nothing about it", async () => {
    selfCancel = undefined;
    render(<EditEventForm eventId={37} />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    expect(screen.queryByRole("switch", { name: "Attendees can give their ticket back" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(saved().has("allow_self_cancel")).toBe(false);
  });

  it("leaves a new event to the server, which makes it with giving back on", () => {
    const values = eventFormSchema.parse({ ...emptyEventForm, ...required });
    expect(values.allow_self_cancel).toBeUndefined();
    expect(toEventFormData(values, "draft").has("allow_self_cancel")).toBe(false);
  });
});

describe("Given back, on the Attendees tab", () => {
  it("lists who gave their ticket back, with their reason and when, under the guest list", async () => {
    render(<RegistrationsPanel eventId={37} />);
    const panel = await screen.findByRole("region", { name: "Given back" });
    expect(within(panel).getByText(/Given back · 2/)).toBeInTheDocument();
    const rows = within(panel).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Meera Nair")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("meera@example.com")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("NEX25AA009")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("“Exam moved to that day, sorry!”")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("No reason given")).toBeInTheDocument();
    expect(panel).toHaveAttribute("id", "given-back");
    // The guest list itself is unchanged: they are not on it.
    expect(screen.getByText("Test Participant One")).toBeInTheDocument();
  });

  it("exports the same rows as Excel or CSV", async () => {
    render(<GivenBackPanel eventId={37} canExport />);
    await screen.findByText("Meera Nair");
    await pickExport(/^Export/, "csv");
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/^given-back-37-.*\.csv$/), expect.stringContaining("Exam moved to that day")));
    await pickExport(/^Export/, "xlsx");
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalledTimes(1));
    const [filename, rows, columns, options] = vi.mocked(downloadXlsx).mock.calls[0]!;
    expect(filename).toMatch(/^given-back-37-.*\.xlsx$/);
    expect(options).toEqual({ sheet: "Given back" });
    expect(toCsv(rows as never[], columns as never)).toBe(vi.mocked(downloadCsv).mock.calls[0]![1]);
    expect(toCsv(rows as never[], columns as never).split("\r\n")[0]).toBe("Name,Email,Ticket,Their reason,Given back");
  });

  it("offers no export to someone who may not export the list", async () => {
    render(<GivenBackPanel eventId={37} canExport={false} />);
    await screen.findByText("Meera Nair");
    expect(screen.queryByRole("button", { name: /^Export/ })).toBeNull();
  });

  it("says so when the event no longer lets guests give tickets back", async () => {
    render(<GivenBackPanel eventId={37} canExport selfCancelOff />);
    expect(await screen.findByText(/Giving tickets back is now switched off for this event/)).toBeInTheDocument();
  });

  it("shows the first ten, and the rest on asking", async () => {
    givenBack = { items: Array.from({ length: 12 }, (_, i) => ({ ...givenBackFixture.items[0], registration_id: `r${i}`, full_name: `Guest ${i + 1}` })) };
    render(<GivenBackPanel eventId={37} canExport />);
    await screen.findByText("Guest 1");
    expect(screen.queryByText("Guest 11")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getByText("Guest 12")).toBeInTheDocument();
  });

  it("isn't there while nobody has given a ticket back", async () => {
    givenBack = { items: [] };
    render(<RegistrationsPanel eventId={37} />);
    await screen.findByText("Test Participant One");
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/cancellations"))).toBe(true));
    expect(screen.queryByRole("region", { name: "Given back" })).toBeNull();
  });

  it("isn't there on an API without the list", async () => {
    givenBack = "missing";
    render(<RegistrationsPanel eventId={37} />);
    await screen.findByText("Test Participant One");
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/cancellations"))).toBe(true));
    expect(screen.queryByRole("region", { name: "Given back" })).toBeNull();
  });
});

describe("the bell's notice", () => {
  it("leads to the event's list, at Given back", async () => {
    expect(alertLink({ kind: "ticket_cancelled", link: "/events/37/registrations" })).toBe("/events/37/registrations");
    expect(KIND_INFO.ticket_cancelled?.label).toBe("Ticket given back");
    await expect(RegistrationsRedirect({ params: Promise.resolve({ eventId: "37" }) })).rejects.toThrow("redirect /events/37/attendees#given-back");
  });
});
