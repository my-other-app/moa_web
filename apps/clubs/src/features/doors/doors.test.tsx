import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import summary from "../__fixtures__/event-summary.json";

type Call = { method: string; path: string; body?: unknown; options?: { query?: Record<string, unknown> } };
const calls: Call[] = [];
const GATE_A = "55555555-5555-5555-5555-555555555555";

const log = {
  items: [
    { id: "c1", registration_id: "r1", name: "Asha Rao", email: "asha@example.com", ticket_id: "T-001", role: "attendee", door: { id: GATE_A, name: "Gate A", kind: "door" }, via: "gate", checked_in_at: "2099-06-09T08:55:00+00:00", recorded_at: "2099-06-09T08:55:00+00:00", by: { kind: "PERSON", id: 9, name: "Vani" } },
    { id: "c2", registration_id: "r2", name: "Kiran Das", email: null, ticket_id: "T-002", role: "speaker", door: { id: null, name: "Kiosk", kind: "kiosk" }, via: "kiosk", checked_in_at: "2099-06-09T08:40:00+00:00", recorded_at: "2099-06-09T08:40:00+00:00", by: { kind: "KIOSK", id: null, name: null } },
  ],
  total: 2,
  page: 1,
  page_size: 50,
  facets: {
    total: 3,
    doors: [
      { id: GATE_A, name: "Gate A", kind: "door", count: 2 },
      { id: null, name: "Kiosk", kind: "kiosk", count: 1 },
    ],
    methods: [{ via: "gate", count: 2 }, { via: "kiosk", count: 1 }],
    staff: [{ id: 9, name: "Vani", count: 2 }],
    first_at: "2099-06-09T08:25:00+00:00",
    last_at: "2099-06-09T08:55:00+00:00",
  },
};

const doors = [
  { id: "d1", event_id: 37, name: "Gate A", kind: "door", sort_order: 0, active: true, volunteers: [{ id: 7, name: "Vani" }], check_ins: 2, link: { prefix: "ab12", can_walkup: true, expires_at: null, expired: false }, created_at: null },
  { id: "d2", event_id: 37, name: "Front desk", kind: "desk", sort_order: 1, active: true, volunteers: [], check_ins: 0, link: null, created_at: null },
];
const team = {
  owner: { name: "Hack Club", email: "club@example.com" },
  volunteers: [
    { id: 7, email: "v@example.com", name: "Vani", user_id: 9, is_approved: true, scope: "event", can_check_in: true, can_walkup: false, can_merch: false, door_id: "d1", check_ins: 2 },
    { id: 8, email: "ravi@example.com", name: null, user_id: null, is_approved: false, scope: "club", can_check_in: false, can_walkup: false, can_merch: true, door_id: null, check_ins: 0 },
  ],
  doors,
  settings: { door_mode: "auto", close_after_minutes: 240, spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false },
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    downloadCsv: vi.fn(),
    api: {
      get: vi.fn(async (path: string, options?: Call["options"]) => {
        calls.push({ method: "GET", path, options });
        if (/\/events\/37\/summary$/.test(path)) return summary;
        if (path.endsWith("/37/check-ins")) return log;
        if (path.endsWith("/37/team")) return team;
        if (path.endsWith("/volunteer/list/37")) return [{ full_name: "Vani Iyer", email_id: "v@example.com" }, { full_name: "Ravi Menon", email_id: "ravi@example.com" }];
        if (path.endsWith("/37/kiosks")) return [];
        if (path.endsWith("/37/kiosks/settings")) return { self_check_in_enabled: false, self_check_in_verify: "name", self_check_in_print: false, has_pin: false };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/doors/d2/link")) return { url: "https://clubs.myotherapp.in/gate/37?key=k-front", key: "k-front", door_id: "d2", expires_at: null, can_walkup: true };
        return {};
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/gate-settings")) return { ...team.settings, ...(body as object) };
        if (path.includes("/team/")) return team;
        return doors[0];
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "DELETE", path, body });
        return {};
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { downloadCsv } = await import("@moa/app-kit");
const { CheckInsPage, TeamPage } = await import("./index");

beforeEach(() => {
  calls.length = 0;
});

describe("check-ins", () => {
  it("reads who is in, who is not and how fast, then every admission", async () => {
    render(<CheckInsPage eventId={37} />);
    expect(await screen.findByText("Not in yet")).toBeInTheDocument();
    expect(screen.getByText("of 24 registered · 13%")).toBeInTheDocument();
    expect(screen.getByText("20 attendees · 1 speaker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Not in yet: 21\. See who/ })).toHaveAttribute("href", "/events/37/attendees?in=no");
    expect(screen.getByText("Turnout by role")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "20 not in yet →" })).toHaveAttribute("href", "/events/37/attendees?in=no&role=attendee");
    expect(screen.getByText("By door")).toBeInTheDocument();
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("Self check-in")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2 admissions")).toBeInTheDocument();
  });

  it("filters by door, and undoes a check-in only when asked twice", async () => {
    render(<CheckInsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    fireEvent.change(screen.getByLabelText("Door"), { target: { value: GATE_A } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/check-ins") && c.options?.query?.door_id === GATE_A)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Undo check-in for Asha Rao" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm undoing the check-in for Asha Rao" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/gate/check-in/r1"))).toBe(true));
  });

  it("exports every page of the log with the filters on", async () => {
    render(<CheckInsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/check-ins") && c.options?.query?.page_size === 100)).toBe(true));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/^check-ins-37-.*\.csv$/), expect.stringContaining("Asha Rao")));
  });
});

describe("doors", () => {
  it("says whether the door is ready: open, its doors and links, who is on duty", async () => {
    render(<TeamPage eventId={37} />);
    expect(await screen.findByText("On check-in duty")).toBeInTheDocument();
    expect(await screen.findByText("shuts 240 min after the end")).toBeInTheDocument();
    expect(screen.getByText("1 with a gate link")).toBeInTheDocument();
    expect(screen.getByText("of 2 volunteers · 1 not approved")).toBeInTheDocument();
    expect(screen.getByText("Gate link on")).toBeInTheDocument();
    // A volunteer who has not signed in yet is named as the organiser typed them.
    expect(await screen.findByText("Ravi Menon")).toBeInTheDocument();
    expect(screen.getByText("Club-wide")).toBeInTheDocument();
    expect(screen.getByText("Not approved yet")).toBeInTheDocument();
  });

  it("makes a gate link that may register walk-ups and shows it once", async () => {
    render(<TeamPage eventId={37} />);
    await screen.findByText("On check-in duty");
    fireEvent.click(screen.getByRole("button", { name: /^Gate link$/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /register walk-ups/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Make the link/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/doors/d2/link"))).toMatchObject({ body: { can_walkup: true } }));
    expect(await within(dialog).findByLabelText("Gate link")).toHaveValue("https://clubs.myotherapp.in/gate/37?key=k-front");
  });

  it("switches a duty, shuts the door, and takes a volunteer off only after asking", async () => {
    render(<TeamPage eventId={37} />);
    await screen.findByText("On check-in duty");
    fireEvent.click(screen.getByRole("switch", { name: "Walk-up for Vani" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/team/7"))).toMatchObject({ body: { can_walkup: true } }));

    fireEvent.click(screen.getByRole("radio", { name: /^Shut/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/gate-settings"))).toMatchObject({ body: { door_mode: "closed" } }));

    fireEvent.click(screen.getByRole("button", { name: "Remove Vani" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE" && c.path.endsWith("/volunteer/remove"))).toMatchObject({ body: { event_id: 37, email_id: "v@example.com" } }));
  });
});
