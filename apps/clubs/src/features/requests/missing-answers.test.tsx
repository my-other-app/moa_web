import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Missing answers on the Review tab (missing-answers contract §3 item 2):
 * the chip "Missing answers (N)" as `missing=1` (N: everyone missing less
 * those on the guest list), the marker on each open registration, and
 * "Missing: …" with Ask again in its answers -- an ask for that one person,
 * named "q" and the request's uuid.
 */
const QUESTIONS = [
  { key: "t_shirt_size", label: "T-shirt size", field_type: "select", required: true, options: ["S", "M", "L"] },
  { key: "why", label: "Why do you want to come?", field_type: "text", required: false },
];
const SUMMARY = {
  people: { registrations: 1, requests: 437 },
  people_missing: 62,
  questions: [
    { key: "t_shirt_size", label: "T-shirt size", required: true, answered: 376, blank: 62, invalid: 0, hidden: 0, missing: 62 },
    { key: "why", label: "Why do you want to come?", required: false, answered: 30, blank: 408, invalid: 0, hidden: 0, missing: 0 },
  ],
  stray: [],
  open_asks: 0,
};
const ME = { role: "editor", role_label: "Editor", role_description: "", can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true, decide_requests: true }, club_id: 5, club_name: "Circuit Society", member: null };

const request = (i: number, missing: string[]) => ({
  id: `rq-000${i}`,
  status: "pending",
  full_name: `Person ${i}`,
  email: `p${i}@example.com`,
  phone: null,
  ticket_type: null,
  answers: { why: "To learn" },
  submitted_at: new Date(Date.UTC(2026, 10, 1, 4, i)).toISOString(),
  decided_at: null,
  decided_by: null,
  decline_note: null,
  registration_id: null,
  pay_by: null,
  amount: null,
  discount_code: null,
  whatsapp_opt_in: false,
  missing_answers: missing,
});
const REQUESTS = [request(1, ["t_shirt_size"]), request(2, [])];

const calls: Array<{ method: string; path: string; query?: Record<string, unknown>; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path.endsWith("/clubs/access/me")) return ME;
        if (path === "/api/v1/events/info/37") return { ...eventFixture, requires_approval: true, additional_details: QUESTIONS };
        if (path === "/api/v1/events/37/summary") return summaryFixture;
        if (path === "/api/v1/events/37/answers/summary") return SUMMARY;
        if (path === "/api/v1/events/registration/37/list") return { items: [], total: 1, limit: 1, offset: 0 };
        if (path === "/api/v1/events/registration/37/requests") {
          const items = init?.query?.missing ? REQUESTS.filter((r) => r.missing_answers.length) : REQUESTS;
          return { items, next: null, counts: { pending: 437, total: 437 }, places_left: null };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/37/answers/asks/preview") return { people: 1, reach: { push: 0, email: 1, whatsapp: 0 }, whatsapp: { available: false, reason: "NO_FEATURE" } };
        if (path === "/api/v1/events/37/answers/asks") return { id: "a1", created_at: "2026-11-08T10:00:00+05:30", status: "open", counts: { people: 1 } };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { RequestsPage } = await import("./components/requests-page");

const requestCalls = () => calls.filter((c) => c.path === "/api/v1/events/registration/37/requests");

beforeEach(() => {
  calls.length = 0;
});

describe("missing answers on the Review tab", () => {
  it("counts the registrations under review missing answers, and filters to them", async () => {
    render(<RequestsPage eventId={37} />);
    // 62 people are missing answers; 1 of them is on the guest list.
    const chip = await screen.findByRole("button", { name: "Missing answers (61)" });
    expect(requestCalls().every((c) => !c.query?.missing)).toBe(true);
    fireEvent.click(chip);
    await waitFor(() => expect(requestCalls().some((c) => c.query?.missing === "1")).toBe(true));
    expect(await screen.findByText(/Missing answers: a question they must answer is blank/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Person 2")).toBeNull());
  });

  it("marks a registration missing answers, names them, and asks that person again", async () => {
    render(<RequestsPage eventId={37} />);
    const name = await screen.findByText("Person 1");
    const row = name.closest("tr")!;
    expect(within(row).getByText("1 missing")).toBeInTheDocument();
    expect(within(screen.getByText("Person 2").closest("tr")!).queryByText(/missing/)).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: /Answers \(1\) of Person 1/ }));
    const note = await screen.findByRole("group", { name: "Missing answers" });
    expect(note).toHaveTextContent("Missing: T-shirt size");
    fireEvent.click(within(note).getByRole("button", { name: /Ask again/ }));
    expect(await screen.findByRole("heading", { name: "Ask Person 1 again" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Send to 1 person" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/answers/asks")).toBe(true));
    expect(calls.find((c) => c.path === "/api/v1/events/37/answers/asks")!.body).toMatchObject({ questions: ["t_shirt_size"], refs: ["qrq-0001"] });
  });
});
