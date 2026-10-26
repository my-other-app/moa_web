import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Confirm each registration around the dashboard: the event's Requests tab
 * and its badge, the switch in the event form and what a save sends, the
 * attention items on the event's overview and the dashboard's home, and the
 * four emails in the library. Against an API without requests none of it
 * shows, and the form sends nothing new.
 */

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let server: "old" | "new" = "new";
/** The event's detail's `requires_approval`; undefined: the detail doesn't carry it. */
let requiresApproval: boolean | undefined = true;
let counts: Record<string, number> = { pending: 3, approved: 1, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
let library: unknown = null;
/** Who is signed in: null, the club's own account assumed; else GET /clubs/access/me. */
let me: unknown = null;
/** What the create answers for `requires_approval`. */
let createdApproval: boolean | undefined = true;
const pathname = { current: "/events/37" };


vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => pathname.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
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
        if (path === "/api/v1/events/info/37") return requiresApproval === undefined ? eventFixture : { ...eventFixture, requires_approval: requiresApproval };
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path === "/api/v1/events/registration/37/requests") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return { items: [], next: null, counts, places_left: 12 };
        }
        if (path === "/api/v1/clubs/me/emails/overview" && library) return library;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/create") return { id: 99, name: "Hack Night", ...(createdApproval === undefined ? {} : { requires_approval: createdApproval }) };
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
const { EventConsole, overviewAttention, eventSummarySchema } = await import("@/features/console");
const { EditEventForm, emptyEventForm, eventFormSchema, useCreateEvent } = await import("@/features/event-form");
const { EmailLibraryPage } = await import("@/features/emails");
const { pendingRequestItems, clubOverviewSchema } = await import("@/features/club");
const { attentionPath } = await import("@moa/app-kit");

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };

beforeEach(() => {
  calls.length = 0;
  server = "new";
  requiresApproval = true;
  counts = { pending: 3, approved: 1, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
  library = null;
  me = null;
  createdApproval = true;
  pathname.current = "/events/37";
});

async function rail() {
  render(
    <EventConsole eventId={37}>
      <p>the panel</p>
    </EventConsole>,
  );
  await screen.findByRole("heading", { level: 1, name: "SF Sea Hackathon" });
  return screen.findByRole("navigation", { name: "Event sections" });
}

describe("the Requests tab", () => {
  it("shows on an event that confirms each registration, with how many wait", async () => {
    const nav = await rail();
    const tab = await within(nav).findByRole("link", { name: /Requests/ });
    expect(tab).toHaveAttribute("href", "/events/37/requests");
    expect(tab).toHaveTextContent("Requests3 waiting");
  });

  it("shows without a badge when nobody waits, and on an event that turned it off but still has requests", async () => {
    counts = { pending: 0, approved: 0, declined: 2, withdrawn: 0, lapsed: 0, closed: 0 };
    requiresApproval = false;
    const nav = await rail();
    const tab = await within(nav).findByRole("link", { name: /Requests/ });
    expect(tab).toHaveTextContent(/^Requests$/);
  });

  it("stays away from an event that doesn't ask and has none, and when the detail doesn't say (off)", async () => {
    counts = { pending: 0, approved: 0, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
    requiresApproval = undefined;
    const nav = await rail();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(within(nav).queryByRole("link", { name: /Requests/ })).toBeNull();
  });

  it("stays away when the API has no requests, whatever the event says", async () => {
    server = "old";
    const nav = await rail();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(within(nav).queryByRole("link", { name: /Requests/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: /Attendees/ })).toBeInTheDocument();
  });
});

describe("the switch in the event form", () => {
  const sw = () => screen.findByRole("switch", { name: "Confirm each registration yourself" });

  it("reads the event's setting, and a save sends the change", async () => {
    requiresApproval = false;
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("People who fill the form go on a waiting list until you confirm them. Their ticket goes out when you do.")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")).toBe(true));
    const fd = calls.find((c) => c.method === "PUT")!.body as FormData;
    expect(fd.get("requires_approval")).toBe("true");
  });

  it("says what switching it off does to the people already waiting", async () => {
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(screen.getByText(/Anyone already waiting stays on the list under Requests until you decide/)).toBeInTheDocument();
  });

  it("is not there, and nothing is sent, when the API has no requests", async () => {
    server = "old";
    requiresApproval = undefined;
    render(<EditEventForm eventId={37} />);
    await screen.findByRole("checkbox", { name: "Merchandise for sale" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(screen.queryByRole("switch", { name: "Confirm each registration yourself" })).toBeNull();
    // A change elsewhere, saved: the form sends no requires_approval.
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")!.body as FormData).has("requires_approval")).toBe(false);
  });
});

describe("making an event that confirms each registration", () => {
  it("says so when the server made the event without it", async () => {
    const warn = vi.spyOn(toast, "warning");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const values = eventFormSchema.parse({ ...emptyEventForm, ...required, requires_approval: true });

    createdApproval = undefined;
    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    await act(() => result.current.mutateAsync({ values, status: "draft" }));
    expect((calls.find((c) => c.path === "/api/v1/events/create")!.body as FormData).get("requires_approval")).toBe("true");
    expect(warn).toHaveBeenCalledWith("The event is saved, but confirming each registration isn't on yet. Turn it on under the event's Settings.");

    warn.mockClear();
    createdApproval = true;
    await act(() => result.current.mutateAsync({ values, status: "draft" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("what needs attention", () => {
  it("puts the people waiting on the event's overview, with the way to Requests", () => {
    const s = eventSummarySchema.parse({ ...summaryFixture, requests_pending: 5 });
    const item = overviewAttention(s).find((i) => i.kind === "REQUESTS_PENDING");
    expect(item).toMatchObject({ tone: "amber", title: "5 people waiting for you to confirm", path: "/requests" });
    // A summary from an API without requests: none, and nothing breaks.
    const old = eventSummarySchema.parse(summaryFixture);
    expect(old.requests_pending).toBe(0);
    expect(overviewAttention(old).map((i) => i.kind)).not.toContain("REQUESTS_PENDING");
  });

  it("lists each event's waiting people on the dashboard's home, once per event, linking to its Requests", () => {
    const event = (id: number, name: string, requests_pending?: number) => ({
      id, name, event_datetime: null, location_name: null, has_fee: false, reg_fee: null, page_views: 0, registrations: 0, attended: 0, view_to_signup: null, turnout: null, ...(requests_pending === undefined ? {} : { requests_pending }),
    });
    const o = clubOverviewSchema.parse({
      period_days: 30,
      kpis: { registrations: { value: 1, previous: 0, delta: null }, page_views: { value: 1, previous: 0, delta: null }, revenue: { value: 0, previous: 0, delta: null }, attendance_rate: { value: null, previous: null, delta: null } },
      revenue_series: { current: [], previous: [] },
      busiest_day: [],
      repeat_rate: null,
      followers: { total: 0, series: [] },
      next_event: event(37, "Hack Night", 1),
      upcoming: [event(37, "Hack Night", 1), event(38, "Demo Day", 12), event(39, "Old API event")],
      needs_attention: [],
      needs_attention_total: 0,
      reach: [],
    });
    const items = pendingRequestItems(o);
    expect(items.map((i) => [i.event_id, i.title])).toEqual([
      [37, "1 person waiting for you to confirm"],
      [38, "12 people waiting for you to confirm"],
    ]);
    expect(items[1]!.body).toMatch(/^For Demo Day\./);
    expect(attentionPath(items[0]!)).toBe("/events/37/requests");
    // The pulse said it already for event 38: not twice.
    const pulse = [{ kind: "REQUESTS_PENDING", tone: "amber" as const, title: "12 waiting", body: "", event_id: 38 }];
    expect(pendingRequestItems(o, pulse).map((i) => i.event_id)).toEqual([37]);
  });
});

describe("the email library", () => {
  const tpl = (id: string, stage: string, label: string, name: string) => ({
    id, clubId: 5, eventId: null, stage, label, name, subject: `${name} · {{event_name}}`,
    design: {}, attachments: {}, audience: { who: "ALL", roles: [] }, trigger: { mode: "MANUAL" }, channels: ["email"], enabled: true, version: 1, sourceId: null,
    createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-26T12:00:00+00:00",
    usage: { events: 1, customised: 0, off: 0, sends: 0, recipients: 0, delivery_rate: null, open_rate: null, bounced: 0, last_sent_at: null },
  });
  const figures = { messages: 0, recipients: 0, sent: 0, failed: 0, delivered: 0, bounced: 0, read: 0, delivery_rate: null, open_rate: null };

  it("lists the four request emails with when each goes out, and renders a stage it doesn't know", async () => {
    library = {
      figures, previous: figures, delta: null,
      templates: [
        tpl("t1", "INVITE", "Invite", "Invite · your ticket"),
        tpl("t9", "REQUEST_LAPSED", "Place released", "Your place was released"),
        tpl("t6", "request_received", "Request received", "You're on the waiting list"),
        tpl("t7", "REQUEST_APPROVED_PAY", "Confirmed", "Pay for your place"),
        tpl("t8", "REQUEST_DECLINED", "Declined", "Sorry, no place this time"),
        tpl("t10", "SOMETHING_NEWER", "Newer", "A newer kind of email"),
      ],
      queue: [], recent: [], attention: { disabled_stages: ["REQUEST_DECLINED"], bounced_30d: 0, failed_30d: 0 },
      all_time: { messages: 0, recipients: 0 }, generated_at: "2026-10-26T12:00:00+00:00",
    };
    render(<EmailLibraryPage />);
    const section = (await screen.findByRole("heading", { name: "Registration requests" })).closest("section")!;
    const names = within(section).getAllByText(/^(You're on the waiting list|Pay for your place|Sorry, no place this time|Your place was released)$/).map((el) => el.textContent);
    expect(names).toEqual(["You're on the waiting list", "Pay for your place", "Sorry, no place this time", "Your place was released"]);
    expect(within(section).getByText("when someone fills the form of an event where you confirm each registration")).toBeInTheDocument();
    expect(within(section).getByText("when you confirm someone with a paid ticket")).toBeInTheDocument();
    // Not a timer and an audience: they go to the one person as their request moves.
    expect(within(section).queryByText(/by hand/)).toBeNull();
    // The journey keeps its own.
    expect(screen.getByRole("heading", { name: "The journey" }).closest("section")).toHaveTextContent("Invite · your ticket");
    // An email this build doesn't know is listed with the others rather than breaking the page.
    expect(screen.getByRole("link", { name: "A newer kind of email" })).toBeInTheDocument();
    expect(screen.getByText(/Request declined is switched off in the library/)).toBeInTheDocument();
  });

  it("lists the emails the server sends by itself under their heading, without an edit", async () => {
    library = {
      figures, previous: figures, delta: null,
      templates: [tpl("t1", "INVITE", "Invite", "Invite · your ticket")],
      queue: [], recent: [], attention: { disabled_stages: [], bounced_30d: 0, failed_30d: 0 },
      all_time: { messages: 0, recipients: 0 }, generated_at: "2026-10-26T12:00:00+00:00",
      automatic: [
        { key: "request_received", name: "Request received", subject: "You're on the waiting list for {{event_name}}", when: "As soon as someone fills the form of an event that confirms each registration.", group: "Registration requests", customisable: false },
        { key: "request_approved", name: "Confirmed · free ticket", subject: "Your ticket for {{event_name}}", when: "When you confirm a free ticket.", group: "Registration requests", customisable: false },
        { key: "request_approved_pay", name: "Confirmed · pay to get your ticket", subject: "{{org_name}} confirmed your place", when: "When you confirm a paid ticket.", group: "Registration requests", customisable: false },
        { key: "request_declined", name: "Declined", subject: "Your request for {{event_name}}", when: "When you decline someone.", group: "Registration requests", customisable: false },
        { key: "request_lapsed", name: "Place released", subject: "Your place was released", when: "When a confirmed paid ticket isn't paid in time.", group: "Registration requests", customisable: false },
      ],
    };
    render(<EmailLibraryPage />);
    const section = (await screen.findByRole("heading", { name: "Registration requests" })).closest("section")!;
    for (const name of ["Request received", "Confirmed · free ticket", "Confirmed · pay to get your ticket", "Declined", "Place released"]) {
      expect(within(section).getByText(name)).toBeInTheDocument();
    }
    expect(within(section).getByText("As soon as someone fills the form of an event that confirms each registration.")).toBeInTheDocument();
    expect(within(section).getByText("You're on the waiting list for {{event_name}}")).toBeInTheDocument();
    expect(within(section).getAllByText("Automatic")).toHaveLength(5);
    expect(within(section).queryByRole("link", { name: /Edit/ })).toBeNull();
  });

  it("shows no such heading for an API without them", async () => {
    library = {
      figures, previous: figures, delta: null, templates: [tpl("t1", "INVITE", "Invite", "Invite · your ticket")],
      queue: [], recent: [], attention: { disabled_stages: [], bounced_30d: 0, failed_30d: 0 },
      all_time: { messages: 0, recipients: 0 }, generated_at: "2026-10-26T12:00:00+00:00",
    };
    render(<EmailLibraryPage />);
    await screen.findByRole("heading", { name: "The journey" });
    expect(screen.queryByRole("heading", { name: "Registration requests" })).toBeNull();
  });
});
