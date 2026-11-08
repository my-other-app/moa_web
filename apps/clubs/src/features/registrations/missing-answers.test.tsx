import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Missing answers on the Attendees tab and the Overview (missing-answers
 * contract §3 items 2–3): the chip "Missing answers (N)" as `missing=1`, the
 * marker on each row, "Missing: …" with Ask again in a guest's detail (an
 * ask for them alone), the Overview item that opens the Ask panel, and the
 * owner's "Answers under an old question → Move to …".
 */
const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => nav.search,
}));

const ONE = registrationsFixture.items[0]!.id;
const QUESTIONS = [
  { key: "t_shirt_size", label: "T-shirt size", field_type: "select", required: true, options: ["S", "M", "L"] },
  { key: "why", label: "Why do you want to come?", field_type: "text", required: false },
  { key: "college", label: "College", field_type: "text", required: true },
];
const SUMMARY = {
  people: { registrations: 2, requests: 60 },
  people_missing: 62,
  questions: [
    { key: "t_shirt_size", label: "T-shirt size", required: true, answered: 0, blank: 62, invalid: 0, hidden: 0, missing: 62 },
    { key: "why", label: "Why do you want to come?", required: false, answered: 30, blank: 32, invalid: 0, hidden: 0, missing: 0 },
    { key: "college", label: "College", required: true, answered: 2, blank: 0, invalid: 0, hidden: 0, missing: 0 },
  ],
  stray: [{ key: "collage", count: 180 }],
  open_asks: 0,
};
const CAN = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true };
const me = (role: "owner" | "editor" | "door") => ({ role, role_label: role, role_description: "", can: { ...CAN, edit_events: role !== "door" }, club_id: 5, club_name: "Circuit Society", member: null });

const calls: Array<{ method: string; path: string; query?: Record<string, unknown>; body?: unknown }> = [];
const state: { me: ReturnType<typeof me> } = { me: me("editor") };
const rows = registrationsFixture.items.map((r, i) => (i === 0 ? { ...r, missing_answers: ["t_shirt_size"] } : { ...r, missing_answers: [] }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path.endsWith("/clubs/access/me")) return state.me;
        if (path === "/api/v1/events/info/37") return { ...eventFixture, additional_details: QUESTIONS };
        if (path === "/api/v1/events/37/summary") return summaryFixture;
        if (path === "/api/v1/events/37/answers/summary") return SUMMARY;
        if (path === "/api/v1/events/37/answers/asks") return { asks: [] };
        if (path === "/api/v1/events/registration/37/list") {
          const q = init?.query ?? {};
          const items = q.missing ? rows.filter((r) => r.missing_answers.length) : rows;
          return { items: q.limit === 1 ? items.slice(0, 1) : items, total: items.length, limit: Number(q.limit ?? 20), offset: 0 };
        }
        if (path === `/api/v1/events/registration/37/info/${ONE}`) return { ...rows[0], additional_details: { why: "To learn" } };
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/analytics")) return analyticsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/37/answers/asks/preview") return { people: (body as { refs: unknown }).refs ? 1 : 62, reach: { push: 1, email: 1, whatsapp: 0 }, whatsapp: { available: false, reason: "NO_FEATURE" } };
        if (path === "/api/v1/events/37/answers/asks") return { id: "a1", created_at: "2026-11-08T10:00:00+05:30", status: "open", counts: { people: 1 } };
        if (path === "/api/v1/events/37/answers/move") return { moved: 178, skipped: 2 };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { RegistrationsPanel } = await import("./components/registrations-panel");
const { EventWorkspace } = await import("./components/event-workspace");

const listCalls = () => calls.filter((c) => c.path === "/api/v1/events/registration/37/list");

beforeEach(() => {
  calls.length = 0;
  state.me = me("editor");
  nav.search = new URLSearchParams();
  nav.replace.mockClear();
  nav.push.mockClear();
});

describe("missing answers on the Attendees tab", () => {
  it("offers the filter with its count, and marks each row with what is missing", async () => {
    render(<RegistrationsPanel eventId={37} />);
    const chip = await screen.findByRole("button", { name: "Missing answers (1)" });
    // The count is the list's own total for missing=1.
    expect(listCalls().some((c) => c.query?.missing === "1" && c.query?.limit === 1)).toBe(true);
    const row = (await screen.findByRole("button", { name: "Open Test Participant One" })).closest("tr")!;
    expect(within(row).getByText("1 missing")).toBeInTheDocument();
    expect(within(row).getByText(": T-shirt size")).toBeInTheDocument();
    fireEvent.click(chip);
    expect(nav.push).toHaveBeenCalledWith("/events/37/attendees?missing=1", { scroll: false });
  });

  it("lists only those missing answers with missing=1 in the address, and offers to ask them", async () => {
    nav.search = new URLSearchParams("missing=1");
    render(<RegistrationsPanel eventId={37} />);
    await waitFor(() => expect(listCalls().some((c) => c.query?.missing === "1" && c.query?.limit !== 1)).toBe(true));
    expect(await screen.findByText(/Missing answers: a question they must answer is blank/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ask them/ }));
    expect(await screen.findByRole("heading", { name: "Ask for missing answers" })).toBeInTheDocument();
  });

  it("names what a guest is missing in their detail, and asks them alone again", async () => {
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    const dialog = await screen.findByRole("dialog");
    const note = await within(dialog).findByRole("group", { name: "Missing answers" });
    expect(note).toHaveTextContent("Missing: T-shirt size");
    fireEvent.click(within(note).getByRole("button", { name: /Ask again/ }));
    expect(await screen.findByRole("heading", { name: "Ask Test Participant One again" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /T-shirt size/ })).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 1 person" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/answers/asks")).toBe(true));
    expect(calls.find((c) => c.path === "/api/v1/events/37/answers/asks")!.body).toMatchObject({ questions: ["t_shirt_size"], refs: [ONE] });
  });

  it("shows door staff what is missing, and no way to ask", async () => {
    state.me = me("door");
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    const dialog = await screen.findByRole("dialog");
    const note = await within(dialog).findByRole("group", { name: "Missing answers" });
    await waitFor(() => expect(within(note).queryByRole("button", { name: /Ask again/ })).toBeNull());
  });
});

describe("missing answers on the Overview", () => {
  it("says who hasn't answered, and opens the Ask panel right there", async () => {
    render(<EventWorkspace eventId={37} />);
    const item = await screen.findByRole("button", { name: /62 people haven't answered every question/ });
    expect(item).toHaveTextContent("Missing: T-shirt size (62).");
    fireEvent.click(item);
    expect(await screen.findByRole("heading", { name: "Ask for missing answers" })).toBeInTheDocument();
  });

  it("gives an owner the answers under an old question to move", async () => {
    state.me = me("owner");
    render(<EventWorkspace eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Answers under an old question: Collage \(180\)/ }));
    const dialog = await screen.findByRole("dialog", { name: /Move the answers under “collage”/ });
    fireEvent.change(within(dialog).getByLabelText("Move to"), { target: { value: "college" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move the answers" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/api/v1/events/37/answers/move")?.body).toEqual({ from: "collage", to: "college" }));
  });

  it("keeps the move from an editor", async () => {
    render(<EventWorkspace eventId={37} />);
    await screen.findByRole("button", { name: /62 people haven't answered/ });
    await waitFor(() => expect(screen.queryByText(/Answers under an old question/)).toBeNull());
  });
});
