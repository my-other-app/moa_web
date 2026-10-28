import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Review registrations around the dashboard: the event's Review tab and its
 * badge, the switch in the event form and what a save sends, the attention
 * items on the event's overview and the dashboard's home, and the six
 * emails in the library. Against an API without requests none of it
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
/** The event's detail's `high_demand_label`; undefined: an older server that doesn't send it. */
let highDemand: boolean | undefined = undefined;
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
        if (path === "/api/v1/events/info/37")
          return {
            ...eventFixture,
            ...(requiresApproval === undefined ? {} : { requires_approval: requiresApproval }),
            ...(highDemand === undefined ? {} : { high_demand_label: highDemand }),
          };
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
  highDemand = undefined;
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

describe("the Review tab", () => {
  it("shows on an event that reviews registrations, with how many are under review", async () => {
    const nav = await rail();
    const tab = await within(nav).findByRole("link", { name: /^Review/ });
    expect(tab).toHaveAttribute("href", "/events/37/requests");
    expect(tab).toHaveTextContent("Review3 under review");
    expect(within(nav).queryByRole("link", { name: /Requests/ })).toBeNull();
  });

  it("shows without a badge when none are under review, and on an event that turned it off but still has some", async () => {
    counts = { pending: 0, approved: 0, declined: 2, withdrawn: 0, lapsed: 0, closed: 0 };
    requiresApproval = false;
    const nav = await rail();
    const tab = await within(nav).findByRole("link", { name: /^Review/ });
    expect(tab).toHaveTextContent(/^Review$/);
  });

  it("stays away from an event that doesn't ask and has none, and when the detail doesn't say (off)", async () => {
    counts = { pending: 0, approved: 0, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
    requiresApproval = undefined;
    const nav = await rail();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(within(nav).queryByRole("link", { name: /^Review/ })).toBeNull();
  });

  it("stays away when the API has no requests, whatever the event says", async () => {
    server = "old";
    const nav = await rail();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(within(nav).queryByRole("link", { name: /^Review/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: /Attendees/ })).toBeInTheDocument();
  });
});

describe("the switch in the event form", () => {
  const sw = () => screen.findByRole("switch", { name: "Review registrations before sending tickets" });

  it("reads the event's setting, says what switching it on does, and a save sends the change", async () => {
    requiresApproval = false;
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Review registrations before sending tickets")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Everyone who registers gets a 'Thanks for registering' email. You confirm or decline each registration in the Review tab, and confirmed people get their ticket by email.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/moves into Review/)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(
      screen.getByText("Anyone on this event's waiting list moves into Review as a registration under review, and gets the 'Thanks for registering' email once."),
    ).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")).toBe(true));
    const fd = calls.find((c) => c.method === "PUT")!.body as FormData;
    expect(fd.get("requires_approval")).toBe("true");
  });

  it("says how many are under review when it is switched off: they stay under review", async () => {
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).toBeChecked();
    // Before the switch moves, no warning (and no note about the waiting list: it was on already).
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(screen.queryByText(/registrations are under review/)).toBeNull();
    expect(screen.queryByText(/moves into Review/)).toBeNull();
    fireEvent.click(toggle);
    expect(
      await screen.findByText("3 registrations are under review. They stay under review until you confirm or decline them; new people get their ticket straight away."),
    ).toBeInTheDocument();
    // Switched back on, the warning goes.
    fireEvent.click(toggle);
    expect(screen.queryByText(/registrations are under review/)).toBeNull();
  });

  it("says none are under review when it is switched off on an event with none", async () => {
    counts = { pending: 0, approved: 2, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    fireEvent.click(toggle);
    expect(await screen.findByText("Once saved, new people get their ticket straight away. No registrations are under review now.")).toBeInTheDocument();
    expect(screen.queryByText(/registrations are under review\./)).toBeNull();
  });

  it("is not there, and nothing is sent, when the API has no requests", async () => {
    server = "old";
    requiresApproval = undefined;
    render(<EditEventForm eventId={37} />);
    await screen.findByRole("checkbox", { name: "Merchandise for sale" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/registration/37/requests")).toBe(true));
    expect(screen.queryByRole("switch", { name: "Review registrations before sending tickets" })).toBeNull();
    // A change elsewhere, saved: the form sends no requires_approval.
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")!.body as FormData).has("requires_approval")).toBe(false);
  });
});

describe("the High demand label", () => {
  const sw = () => screen.findByRole("switch", { name: "High demand label" });

  it("reads the event's label, says what it does (a tag, no numbers), and a save sends it", async () => {
    highDemand = false;
    render(<EditEventForm eventId={37} />);
    const toggle = await sw();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Shows a “High demand” tag on the event's public page. No numbers are shown.")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")!.body as FormData).get("high_demand_label")).toBe("true");
  });

  it("isn't there for an older server, and a save sends nothing about it", async () => {
    highDemand = undefined;
    render(<EditEventForm eventId={37} />);
    await screen.findByRole("switch", { name: "Review registrations before sending tickets" });
    expect(screen.queryByRole("switch", { name: "High demand label" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")!.body as FormData).has("high_demand_label")).toBe(false);
  });

  it("isn't offered on a new event (it is switched on later, once the demand is there)", () => {
    const values = eventFormSchema.parse({ ...emptyEventForm, ...required });
    expect(values.high_demand_label).toBeUndefined();
  });
});

describe("making an event that reviews registrations", () => {
  it("says so when the server made the event without it", async () => {
    const warn = vi.spyOn(toast, "warning");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const values = eventFormSchema.parse({ ...emptyEventForm, ...required, requires_approval: true });

    createdApproval = undefined;
    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    await act(() => result.current.mutateAsync({ values, status: "draft" }));
    expect((calls.find((c) => c.path === "/api/v1/events/create")!.body as FormData).get("requires_approval")).toBe("true");
    expect(warn).toHaveBeenCalledWith("The event is saved, but reviewing registrations isn't on yet. Turn it on under the event's Settings.");

    warn.mockClear();
    createdApproval = true;
    await act(() => result.current.mutateAsync({ values, status: "draft" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("what needs attention", () => {
  it("puts the registrations under review on the event's overview, with the way to Review", () => {
    const s = eventSummarySchema.parse({ ...summaryFixture, requests_pending: 5 });
    const item = overviewAttention(s).find((i) => i.kind === "REQUESTS_PENDING");
    expect(item).toMatchObject({ tone: "amber", title: "5 registrations to review", path: "/requests" });
    expect(overviewAttention(eventSummarySchema.parse({ ...summaryFixture, requests_pending: 1 })).find((i) => i.kind === "REQUESTS_PENDING")?.title).toBe("1 registration to review");
    // A summary from an API without requests: none, and nothing breaks.
    const old = eventSummarySchema.parse(summaryFixture);
    expect(old.requests_pending).toBe(0);
    expect(overviewAttention(old).map((i) => i.kind)).not.toContain("REQUESTS_PENDING");
  });

  it("lists each event's registrations to review on the dashboard's home, once per event, linking to its Review tab", () => {
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
      [37, "1 registration to review"],
      [38, "12 registrations to review"],
    ]);
    expect(items[1]!.body).toMatch(/^For Demo Day\./);
    expect(attentionPath(items[0]!)).toBe("/events/37/requests");
    // The pulse said it already for event 38: not twice.
    const pulse = [{ kind: "REQUESTS_PENDING", tone: "amber" as const, title: "12 waiting", body: "", event_id: 38 }];
    expect(pendingRequestItems(o, pulse).map((i) => i.event_id)).toEqual([37]);
  });
});

describe("the email library", () => {
  const tpl = (id: string, stage: string, label: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, clubId: 5, eventId: null, stage, label, name, subject: `${name} · {{event_name}}`,
    design: {}, attachments: {}, audience: { who: "ALL", roles: [] }, trigger: { mode: "MANUAL" }, channels: ["email"], enabled: true, version: 1, sourceId: null,
    createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-26T12:00:00+00:00",
    usage: { events: 1, customised: 0, off: 0, sends: 0, recipients: 0, delivery_rate: null, open_rate: null, bounced: 0, last_sent_at: null },
    ...extra,
  });
  const figures = { messages: 0, recipients: 0, sent: 0, failed: 0, delivered: 0, bounced: 0, read: 0, delivery_rate: null, open_rate: null };
  const review = (id: string, stage: string, name: string) =>
    tpl(id, stage, name, name, { key: stage.toLowerCase(), group: "Registration review", when: "a sentence the server may send" });

  it("lists the six registration review emails as editable cards: when each goes out, sent by itself, no figures", async () => {
    library = {
      figures, previous: figures, delta: null,
      templates: [
        tpl("t1", "INVITE", "Invite", "Invite · your ticket"),
        review("t11", "REQUEST_UNANSWERED", "Closed before review"),
        review("t9", "REQUEST_LAPSED", "Expired · not paid in time"),
        review("t6", "request_received", "Thanks for registering"),
        review("t12", "REQUEST_APPROVED", "Confirmed · ticket"),
        review("t7", "REQUEST_APPROVED_PAY", "Confirmed · pay for the ticket"),
        tpl("t8", "REQUEST_DECLINED", "Not confirmed", "Sorry, not this time"),
        tpl("t10", "SOMETHING_NEWER", "Newer", "A newer kind of email"),
      ],
      queue: [], recent: [], attention: { disabled_stages: ["REQUEST_DECLINED"], bounced_30d: 0, failed_30d: 0 },
      all_time: { messages: 0, recipients: 0 }, generated_at: "2026-10-26T12:00:00+00:00",
      // A server in between that still lists them as automatic too: one card each, the editable one.
      automatic: [{ key: "request_received", name: "Request received", subject: "You're on the waiting list", when: "Old words.", group: "Registration requests", customisable: false }],
    };
    render(<EmailLibraryPage />);
    const section = (await screen.findByRole("heading", { name: "Registration review" })).closest("section")!;
    expect(within(section).getByText("For events that review registrations. Each goes to the one person, by itself, as their registration moves. Edit the words; they go in your club's colours and logo.")).toBeInTheDocument();
    const names = within(section)
      .getAllByText(/^(Thanks for registering|Confirmed · ticket|Confirmed · pay for the ticket|Sorry, not this time|Expired · not paid in time|Closed before review)$/, { selector: "p" })
      .map((el) => el.textContent);
    expect(names).toEqual(["Thanks for registering", "Confirmed · ticket", "Confirmed · pay for the ticket", "Sorry, not this time", "Expired · not paid in time", "Closed before review"]);
    // A renamed one keeps its stage's name above its own.
    expect(within(section).getByText("Not confirmed")).toBeInTheDocument();
    expect(within(section).getByText("Goes out as soon as someone registers for an event that reviews registrations.")).toBeInTheDocument();
    expect(within(section).getByText("Goes out when you confirm a free ticket. It is the ticket email for confirmed people, with the ticket attached.")).toBeInTheDocument();
    expect(within(section).getByText("Goes out when you confirm a paid ticket: the pay link and the pay-by time.")).toBeInTheDocument();
    expect(within(section).getByText('Goes out when you decline someone and leave "Email them" on, with your note if you wrote one.')).toBeInTheDocument();
    expect(within(section).getByText("Goes out when a confirmed paid ticket isn't paid in time.")).toBeInTheDocument();
    expect(within(section).getByText("Goes out when the event ends, or is deleted, while someone is still under review: once to each.")).toBeInTheDocument();
    // Sent by itself, not a timer and an audience, and no figures.
    expect(within(section).getAllByText(/^Sent by itself/)).toHaveLength(6);
    expect(within(section).queryByText(/by hand|sent to|opened/)).toBeNull();
    expect(within(section).queryByText("Automatic")).toBeNull();
    expect(within(section).queryByText("Request received")).toBeNull();
    // Preview and Edit on each.
    expect(within(section).getAllByRole("link", { name: /Edit/ }).map((a) => a.getAttribute("href"))).toEqual([
      "/emails/t6", "/emails/t12", "/emails/t7", "/emails/t8", "/emails/t9", "/emails/t11",
    ]);
    expect(within(section).getByRole("button", { name: "Preview Thanks for registering" })).toBeInTheDocument();
    // Nothing in the section speaks of requests, waiting or places.
    expect(section).not.toHaveTextContent(/request|waiting|place/i);
    // The journey keeps its own.
    expect(screen.getByRole("heading", { name: "The journey" }).closest("section")).toHaveTextContent("Invite · your ticket");
    // An email this build doesn't know is listed with the others rather than breaking the page.
    expect(screen.getByRole("link", { name: "A newer kind of email" })).toBeInTheDocument();
    // They are always on: never "switched off in the library".
    expect(screen.queryByText(/switched off in the library/)).toBeNull();
  });

  it("lists the emails an older server sends by itself under Registration review, by today's names, without an edit", async () => {
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
        { key: "venue_changed", name: "Venue changed", subject: "New venue", when: "When you change the venue.", group: "Event changes", customisable: false },
      ],
    };
    render(<EmailLibraryPage />);
    const section = (await screen.findByRole("heading", { name: "Registration review" })).closest("section")!;
    expect(screen.queryByRole("heading", { name: "Registration requests" })).toBeNull();
    expect(within(section).getByText("For events that review registrations. Each goes to the one person, by itself, as their registration moves.")).toBeInTheDocument();
    for (const name of ["Thanks for registering", "Confirmed · ticket", "Confirmed · pay for the ticket", "Not confirmed", "Expired · not paid in time"]) {
      expect(within(section).getByText(name)).toBeInTheDocument();
    }
    expect(within(section).getByText("Goes out as soon as someone registers for an event that reviews registrations.")).toBeInTheDocument();
    // The subject is the one the server sends today.
    expect(within(section).getByText("You're on the waiting list for {{event_name}}")).toBeInTheDocument();
    expect(within(section).getAllByText("Automatic")).toHaveLength(5);
    expect(within(section).queryByRole("link", { name: /Edit/ })).toBeNull();
    // Another group keeps its own heading and words.
    const other = screen.getByRole("heading", { name: "Event changes" }).closest("section")!;
    expect(within(other).getByText("Venue changed")).toBeInTheDocument();
    expect(within(other).getByText("When you change the venue.")).toBeInTheDocument();
  });

  it("shows no such heading for an API without them", async () => {
    library = {
      figures, previous: figures, delta: null, templates: [tpl("t1", "INVITE", "Invite", "Invite · your ticket")],
      queue: [], recent: [], attention: { disabled_stages: [], bounced_30d: 0, failed_30d: 0 },
      all_time: { messages: 0, recipients: 0 }, generated_at: "2026-10-26T12:00:00+00:00",
    };
    render(<EmailLibraryPage />);
    await screen.findByRole("heading", { name: "The journey" });
    expect(screen.queryByRole("heading", { name: "Registration review" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Registration requests" })).toBeNull();
  });
});
