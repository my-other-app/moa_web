import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { FakeState } from "@/test/fake-api";

/**
 * Leads: the board's stage rules (drag or the card's menu; only the owner
 * moves; Lost needs a reason; a move that leaves no next step asks for
 * one), the duplicate warning on a new lead, the import's dry run, and the
 * form opened filled in from another page ("Make a lead").
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const me = vi.hoisted(() => ({ id: 1 }));
const nav = vi.hoisted(() => ({ qs: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/teamwork/leads",
  useSearchParams: () => new URLSearchParams(nav.qs),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: me.id, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf } = await import("@/test/fake-api");
const { LeadsPage, stageMove, byStage, importSummary, prefillFrom, newLeadHref, readMatches } = await import("./index");

const TEAMS = [
  { key: "support", members: [{ user_id: 2, name: "Sam", email: "sam@x.in", away: false }] },
  { key: "sales", members: [{ user_id: 3, name: "Lata", email: "lata@x.in", away: false }, { user_id: 4, name: "Ravi", email: "ravi@x.in", away: false }] },
];

const lead = (over: Record<string, unknown> = {}) => ({
  id: 5,
  name: "TinkerHub",
  type: "club",
  stage: "contacted",
  city: "Kochi",
  owner: { id: 3, name: "Lata" },
  value_inr: 24000,
  expected_close: null,
  next_follow_up: { id: 9, due_at: "2026-11-12T10:00:00Z", kind: "call", title: "Intro call" },
  overdue: false,
  contacts_count: 1,
  updated_at: "2026-11-11T09:00:00Z",
  ...over,
});

beforeEach(() => {
  freshState(state);
  me.id = 1;
  nav.qs = "";
  nav.replace.mockClear();
  nav.push.mockClear();
  state.handlers["GET /api/v1/admin/teams"] = () => TEAMS;
  state.handlers["GET /api/v1/admin/leads"] = () => ({ items: [lead(), lead({ id: 6, name: "Brew & Co", type: "sponsor", stage: "proposal", owner: { id: 4, name: "Ravi" }, next_follow_up: null })], total: 2, by_stage: { contacted: 1, proposal: 1 } });
  state.handlers["GET /api/v1/admin/leads/lost-reasons"] = () => [
    { id: 1, key: "no_budget", label: "No budget" },
    { id: 2, key: "timing", label: "Timing" },
    { id: 3, key: "old", label: "Archived reason", active: false },
  ];
  state.handlers["PATCH /api/v1/admin/leads/5"] = ({ body }) => ({ ...lead(body as Record<string, unknown>), needs_follow_up: true });
  state.handlers["POST /api/v1/admin/follow-ups"] = ({ body }) => ({ id: 20, ...(body as object) });
});

describe("the stage rules", () => {
  it("does nothing on the same stage, refuses someone who may not move it, asks why for Lost, else moves", () => {
    expect(stageMove("new", "new", true)).toBe("noop");
    expect(stageMove("new", "meeting", false)).toBe("denied");
    expect(stageMove("negotiation", "lost", true)).toBe("needs_reason");
    expect(stageMove("negotiation", "won", true)).toBe("move");
  });

  it("puts each lead in its stage's column, in stage order", () => {
    const cols = byStage([lead(), lead({ id: 6, stage: "won" }), lead({ id: 7, stage: "unknown" })] as never);
    expect(Object.keys(cols)).toEqual(["new", "contacted", "meeting", "proposal", "negotiation", "won", "lost"]);
    expect(cols.contacted.map((l) => l.id)).toEqual([5]);
    expect(cols.won.map((l) => l.id)).toEqual([6]);
  });
});

describe("the board", () => {
  const column = (name: string) => screen.getByRole("region", { name });
  const card = (name: string) => screen.getByRole("link", { name }).closest("li")!;

  it("moves a lead dragged to another stage, then asks for its next step", async () => {
    render(<LeadsPage />);
    await screen.findByRole("link", { name: "TinkerHub" });
    fireEvent.dragStart(card("TinkerHub"));
    fireEvent.dragOver(column("Meeting"));
    fireEvent.drop(column("Meeting"));
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/leads/5")[0]?.body).toEqual({ stage: "meeting" }));
    expect(await screen.findByText("What's the next step?")).toBeInTheDocument();
  });

  it("asks why before a lead goes to Lost, and sends the reason and the try-again date", async () => {
    render(<LeadsPage />);
    await screen.findByRole("link", { name: "TinkerHub" });
    fireEvent.dragStart(card("TinkerHub"));
    fireEvent.drop(column("Lost"));
    expect(await screen.findByText("Mark TinkerHub lost")).toBeInTheDocument();
    expect(callsOf(state, "PATCH")).toHaveLength(0);
    const mark = screen.getByRole("button", { name: "Mark lost" });
    expect(mark).toBeDisabled();
    const why = await screen.findByLabelText("Why");
    await within(why).findByRole("option", { name: "No budget" });
    expect(within(why).queryByRole("option", { name: "Archived reason" })).toBeNull();
    fireEvent.change(why, { target: { value: "no_budget" } });
    fireEvent.change(screen.getByLabelText("Try again on (optional)"), { target: { value: "2027-03-01" } });
    fireEvent.click(mark);
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/leads/5")[0]?.body).toEqual({ stage: "lost", lost_reason: "no_budget", retry_on: "2027-03-01" }));
    // A lost lead isn't asked for a next step.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("What's the next step?")).toBeNull();
  });

  it("lets a Sales member move only their own leads", async () => {
    me.id = 3;
    state.role = "viewer";
    render(<LeadsPage />);
    await screen.findByRole("link", { name: "TinkerHub" });
    await waitFor(() => expect(card("TinkerHub")).toHaveAttribute("draggable", "true"));
    expect(card("Brew & Co")).toHaveAttribute("draggable", "false");
    expect(screen.getByLabelText("Move TinkerHub to")).toBeInTheDocument();
    expect(screen.queryByLabelText("Move Brew & Co to")).toBeNull();
    fireEvent.dragStart(card("Brew & Co"));
    fireEvent.drop(column("Won"));
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf(state, "PATCH")).toHaveLength(0);
  });

  it("moves from the keyboard with the card's stage menu", async () => {
    render(<LeadsPage />);
    fireEvent.change(await screen.findByLabelText("Move TinkerHub to"), { target: { value: "proposal" } });
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/leads/5")[0]?.body).toEqual({ stage: "proposal" }));
  });

  it("offers no New lead or Import to an admin outside Sales", async () => {
    me.id = 2;
    state.role = "support";
    render(<LeadsPage />);
    await screen.findByRole("link", { name: "TinkerHub" });
    expect(screen.queryByRole("button", { name: /New lead/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();
    expect(screen.queryByLabelText("Move TinkerHub to")).toBeNull();
  });
});

describe("a new lead", () => {
  it("shows the leads it may repeat, and adds it anyway only when asked", async () => {
    state.handlers["POST /api/v1/admin/leads"] = ({ body }) => {
      if ((body as { force?: boolean }).force) return { id: 30, name: "TinkerHub Kochi" };
      throw new ApiError({ message: "This looks like a lead we already have.", status: 409, errorCode: "DUPLICATE_LEAD", fieldErrors: { matches: [{ id: 5, name: "TinkerHub", city: "Kochi" }] } as never });
    };
    render(<LeadsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New lead/ }));
    const form = within(await screen.findByRole("dialog"));
    fireEvent.change(form.getByLabelText("Organisation"), { target: { value: "TinkerHub Kochi" } });
    fireEvent.change(form.getByLabelText("City"), { target: { value: "Kochi" } });
    fireEvent.click(form.getByRole("button", { name: "Add lead" }));
    const warning = await screen.findByText(/may be a lead we already have/);
    expect(within(warning.closest("[role=alert]") as HTMLElement).getByRole("link", { name: "TinkerHub" })).toHaveAttribute("href", "/teamwork/leads/5");
    expect(callsOf(state, "POST", "/api/v1/admin/leads")[0]!.body).toMatchObject({ name: "TinkerHub Kochi", city: "Kochi", type: "club", force: false });
    fireEvent.click(screen.getByRole("button", { name: "Add it anyway" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/leads")[1]?.body).toMatchObject({ name: "TinkerHub Kochi", force: true }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/teamwork/leads/30"));
  });

  it("reads the matches wherever the 409 carries them", () => {
    const m = [{ id: 5, name: "TinkerHub", city: null }];
    expect(readMatches({ matches: m })).toEqual(m);
    expect(readMatches({ errors: { matches: m } })).toEqual(m);
    expect(readMatches({ message: "nope" })).toBeNull();
  });

  it("opens filled in from another page's link: organisation, type and source", async () => {
    nav.qs = new URL(newLeadHref({ name: "Acme Labs", type: "sponsor", source: "speaker" }), "http://x").search;
    expect(prefillFrom(new URLSearchParams(nav.qs))).toEqual({ name: "Acme Labs", type: "sponsor", source: "speaker" });
    render(<LeadsPage />);
    const form = within(await screen.findByRole("dialog"));
    expect(form.getByLabelText("Organisation")).toHaveValue("Acme Labs");
    expect(form.getByLabelText("Type")).toHaveValue("sponsor");
    expect(form.getByLabelText("Where it came from")).toHaveValue("speaker");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teamwork/leads"));
  });
});

describe("importing a sheet", () => {
  it("checks the sheet first (a dry run that creates nothing), then imports the new rows", async () => {
    state.handlers["POST /api/v1/admin/leads/import"] = ({ body, query }) => {
      const dry = (body as FormData).get("dry_run") === "true";
      expect(query).toEqual({ dry_run: dry });
      return dry
        ? {
            rows: [
              { row: 2, name: "Brew & Co", type: "sponsor", city: "Kochi", email: "hi@brew.in", status: "new" },
              { row: 3, name: "TinkerHub", type: "club", city: "Kochi", status: "duplicate", match_id: 5 },
              { row: 4, name: null, status: "error", error: "No name" },
            ],
          }
        : { rows: [], created: 1 };
    };
    expect(importSummary([{ row: 1, status: "new" }, { row: 2, status: "error" }] as never)).toEqual({ new: 1, duplicate: 0, error: 1 });
    render(<LeadsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Import/ }));
    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeDisabled();
    const file = new File(["name,type"], "leads.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Sheet to import"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Check the sheet" }));
    expect(await screen.findByText("1 new · 1 already here · 1 can't be read")).toBeInTheDocument();
    expect(screen.getByText("No name")).toBeInTheDocument();
    const posts = () => callsOf(state, "POST", "/api/v1/admin/leads/import");
    expect((posts()[0]!.body as FormData).get("file")).toBe(file);
    fireEvent.click(screen.getByRole("button", { name: "Import 1 new leads" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect((posts()[1]!.body as FormData).get("dry_run")).toBe("false");
    expect(await screen.findByText(/1 leads imported/)).toBeInTheDocument();
  });
});
