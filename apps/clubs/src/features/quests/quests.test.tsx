import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Event → Quests (quests contract §9): the switch, off by default; the
 * settings; tasks from the templates, with their rules (the Network "met N
 * people" rule among them) and secret codes; milestones with rewards from
 * the event's swag and their stock; stations and swag desks with their door
 * links; the live numbers; the guests with grants and revokes; the export;
 * and the same page, read only, for door staff. The API is stubbed in its
 * shapes; invented data throughout.
 */

type Call = { method: string; path: string; body?: unknown; options?: { query?: Record<string, unknown> } };
const calls: Call[] = [];
const EVENT = 42;

const stock = (total: number, reserved: number, collected: number, variants: unknown[] = []) => ({ total, reserved, collected, free: total - reserved - collected, variants });

const QUEST = {
  id: "q1",
  event_id: EVENT,
  enabled: false,
  title: "DevFest Quest",
  intro: "Do five things, win a T-shirt.",
  mode: "points",
  starts_at: null,
  ends_at: null,
  leaderboard: false,
  leaderboard_names: "initial",
  code_attempts_per_hour: 10,
  updated_at: "2026-11-21T10:00:00Z",
  tasks: [
    { id: "t1", kind: "checked_in", title: "Check in", description: null, points: 10, required: true, starts_at: null, ends_at: null, config: { before: null }, sort_order: 0, target: 1, action: "ticket", done_count: 300, in_progress: 0 },
    { id: "t2", kind: "network", title: "Meet 5 people", description: null, points: 20, required: false, starts_at: null, ends_at: null, config: { count: 5, direction: "either", per_minute: 2 }, sort_order: 1, target: 5, action: "network_scan", done_count: 120, in_progress: 80 },
    { id: "t3", kind: "code", title: "Keynote code", description: null, points: 15, required: false, starts_at: "2026-11-28T04:00:00Z", ends_at: "2026-11-28T05:00:00Z", config: { code: "CLOUD24" }, sort_order: 2, target: 1, action: "code", done_count: 210 },
    { id: "t4", kind: "station", title: "Visit the Google Cloud booth", description: null, points: 10, required: false, starts_at: null, ends_at: null, config: { door_id: "st1" }, sort_order: 3, target: 1, action: "station", station: { door_id: "st1", name: "Google Cloud booth" }, done_count: 180 },
  ],
  milestones: [
    {
      id: "m1",
      title: "Tier 1",
      threshold: 30,
      sort_order: 0,
      rewards: [
        {
          id: "rw1",
          merch_item_id: "i1",
          name: "DevFest T-shirt",
          photo_url: null,
          sold_out_mode: "waitlist",
          sizes: true,
          stock: stock(200, 41, 12, [{ id: "v1", label: "M", total: 80, reserved: 20, collected: 5, free: 55 }]),
          claims: { reserved: 41, needs_size: 3, waitlisted: 0, sold_out: 0, collected: 12, released: 1 },
        },
      ],
    },
  ],
  stations: [
    { id: "st1", door_id: "st1", name: "Google Cloud booth", purpose: "station", active: true, link: { prefix: "ab12", can_walkup: false, expires_at: null, expired: false }, visits: 180, last_visit_at: "2026-11-28T06:00:00Z" },
  ],
  swag_items: [
    { id: "i1", name: "DevFest T-shirt", photo_url: null, sizes: true, stock: stock(200, 41, 12), reward_id: "rw1" },
    { id: "i2", name: "Sticker pack", photo_url: null, sizes: false, stock: stock(500, 0, 0), reward_id: null },
  ],
};

const TEMPLATES = [
  // As the server sends them (app/api/quests/kinds.py templates()): short labels, plain choices.
  { kind: "checked_in", label: "Checked in", description: "Ticked at check-in.", default_title: "Check in", action: "ticket", automatic: true, default_config: {}, fields: [{ key: "before", type: "datetime", label: "Before", required: false, min: null, max: null, options: [], default: null }] },
  {
    kind: "network",
    label: "Met people in Network",
    description: "Distinct checked-in guests met by scanning their QR in Network.",
    default_title: "Meet 3 people",
    default_config: { count: 3, direction: "either", per_minute: 2 },
    fields: [
      { key: "count", type: "int", label: "People", required: false, min: 1, max: 50, options: [], default: 3 },
      { key: "direction", type: "choice", label: "Who scans", required: false, min: null, max: null, options: ["saved", "saved_by", "either"], default: "either" },
      { key: "per_minute", type: "int", label: "At most per minute", required: false, min: 1, max: 10, options: [], default: 2 },
    ],
  },
  { kind: "code", label: "Secret code", description: "They type a code you show.", default_title: "Find the code", default_config: {}, fields: [{ key: "code", type: "text", label: "Code", required: true, min: null, max: null, options: [], default: null }] },
  { kind: "manual", label: "Marked done by you", description: "You tick it per guest.", default_title: "Hackathon submitted", default_config: {}, fields: [] },
];

const DASHBOARD = {
  enabled: true,
  participants: 412,
  checked_in: 830,
  tasks: [
    { id: "t1", title: "Check in", kind: "checked_in", done: 300, in_progress: 0 },
    { id: "t2", title: "Meet 5 people", kind: "network", done: 120, in_progress: 80 },
  ],
  milestones: [{ id: "m1", title: "Tier 1", threshold: 30, unlocked: 210 }],
  rewards: [{ id: "rw1", name: "DevFest T-shirt", reserved: 150, needs_size: 4, waitlisted: 0, sold_out: 0, collected: 60, stock: stock(200, 150, 60) }],
  stations: [{ door_id: "st1", name: "Google Cloud booth", purpose: "station", visits: 180, last_visit_at: "2026-11-28T06:00:00Z" }],
  recent: [{ at: new Date().toISOString(), name: "Asha K.", what: "unlocked Tier 1" }],
  computed_at: new Date().toISOString(),
};

const GUESTS = {
  items: [
    { registration_id: "r1", name: "Asha Kumar", email: "asha@example.com", ticket_id: "MOA-7K3QF-X9PWM", checked_in: true, points: 55, tasks_done: 4, milestones: ["m1"], claims: [{ claim_id: "c1", reward_id: "rw1", name: "DevFest T-shirt", status: "reserved", variant_label: "M" }] },
  ],
  total: 1,
  page: 1,
  page_size: 25,
};

const GUEST = {
  enabled: true,
  tasks: [
    { id: "t1", kind: "checked_in", title: "Check in", points: 10, required: true, target: 1, me: { count: 1, done: true, done_at: "2026-11-28T04:10:00Z", source: "auto", revoked: false } },
    { id: "t5", kind: "manual", title: "Hackathon submitted", points: 25, required: false, target: 1, me: { count: 0, done: false, done_at: null, source: null, revoked: false } },
  ],
  milestones: [{ id: "m1", title: "Tier 1", threshold: 30, unlocked: true, unlocked_at: "2026-11-28T05:00:00Z", rewards: [{ reward_id: "rw1", name: "DevFest T-shirt", claim: { claim_id: "c1", status: "reserved", needs_size: false, variant_label: "M" } }] }],
  me: { registration_id: "r1", points: 55, tasks_done: 4, required_left: 0 },
  guest: { registration_id: "r1", name: "Asha Kumar", email: "asha@example.com", ticket_id: "MOA-7K3QF-X9PWM" },
  audit: [{ at: "2026-11-28T05:30:00Z", by: { id: 2, name: "Meera" }, action: "grant", registration_id: "r1", name: "Asha Kumar", task: { id: "t9", title: "Talk given" }, reward: null, note: "Gave the lightning talk" }],
};

const state = { quest: structuredClone(QUEST) as Record<string, unknown>, routeMissing: false };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { ApiError } = await import("@moa/api");
  const missing = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: Call["options"]) => {
        calls.push({ method: "GET", path, options });
        if (state.routeMissing && path.includes("/quests")) throw missing();
        if (path.endsWith(`/events/${EVENT}/quests`)) return state.quest;
        if (path.endsWith("/quests/templates")) return TEMPLATES;
        if (path.endsWith("/quests/dashboard")) return DASHBOARD;
        if (path.endsWith("/quests/leaderboard")) return { mode: "points", rows: [{ rank: 1, name: "Asha Kumar", score: 120 }, { rank: 2, name: "Ben Thomas", score: 95 }] };
        if (path.endsWith("/quests/guests")) return GUESTS;
        if (path.endsWith("/quests/guests/r1")) return GUEST;
        if (path.endsWith("/quests/audit")) return { items: GUEST.audit, total: 1 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith(`/events/${EVENT}/quests`)) {
          state.quest = { ...state.quest, ...body, updated_at: new Date().toISOString() };
          return state.quest;
        }
        if (path.includes("/quests/tasks/")) return { ...QUEST.tasks[2], ...body };
        if (path.includes("/quests/rewards/")) return QUEST.milestones[0]!.rewards[0];
        return {};
      }),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/quests/tasks")) return { id: "t9", sort_order: 9, target: 1, action: null, done_count: 0, points: 10, required: false, starts_at: null, ends_at: null, description: null, ...body };
        if (path.endsWith("/quests/milestones")) return { id: "m2", sort_order: 1, rewards: [], ...body };
        if (path.includes("/rewards") && path.endsWith("/reoffer")) return { held: 2, still_sold_out: 1 };
        if (path.includes("/milestones/") && path.endsWith("/rewards")) return { ...QUEST.milestones[0]!.rewards[0], id: "rw2", merch_item_id: body.merch_item_id, name: "Sticker pack" };
        if (path.endsWith("/quests/stations"))
          return {
            door: { id: "st2", name: body.name, kind: "door", active: true, purpose: body.purpose },
            link: { url: "https://clubs.myotherapp.in/gate/42?key=k-booth", key: "k-booth", door_id: "st2", expires_at: null, can_walkup: false },
            task: body.task ? { id: "t10", kind: "station", title: (body.task as { title: string }).title, config: { door_id: "st2" }, done_count: 0 } : null,
          };
        if (path.endsWith("/grant") || path.endsWith("/revoke")) return GUEST;
        if (path.endsWith("/recompute")) return { queued: true };
        return {};
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return QUEST.tasks;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return { deleted: true };
      }),
    },
  };
});

const access = { can: { edit_events: true, exports: true } as Record<string, boolean>, roleLabel: "Owner" };
vi.mock("@/features/access", () => ({ useAccess: () => access }));
vi.mock("@/features/events", () => ({ useEventDetail: (id: number) => ({ data: id ? { id, name: "DevFest 2026" } : undefined }) }));

const { render } = await import("@/test/render");
const { QuestsPage } = await import("./components/quests-page");
const { codeSheetHtml, codeProblem, generateCode, normalizeCode, ruleLine, suggestTitle } = await import("./lib/kinds");
const { questAdminSchema, templatesSchema } = await import("./schemas");
const { thresholdProblem } = await import("./components/milestones-panel");

const parsed = () => questAdminSchema.parse(QUEST);
const on = () => (state.quest = { ...structuredClone(QUEST), enabled: true });

beforeEach(() => {
  calls.length = 0;
  state.quest = structuredClone(QUEST);
  state.routeMissing = false;
  access.can = { edit_events: true, exports: true };
});

describe("the switch and the settings", () => {
  it("is off by default, says so, and shows no numbers or guests yet", async () => {
    render(<QuestsPage eventId={EVENT} />);
    const sw = await screen.findByRole("switch", { name: "Quests" });
    expect(sw).not.toBeChecked();
    expect(screen.getByText(/Off: guests see nothing and nothing is counted/)).toBeInTheDocument();
  });

  it("switches on at once, and off only after asking", async () => {
    state.quest = { ...structuredClone(QUEST), tasks: QUEST.tasks.map((t) => ({ ...t, done_count: 0 })) };
    render(<QuestsPage eventId={EVENT} />);
    expect(screen.queryByText("Taking part")).toBeNull();
    fireEvent.click(await screen.findByRole("switch", { name: "Quests" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/quests"))).toMatchObject({ body: { enabled: true } }));
    const sw = await screen.findByRole("switch", { name: "Quests" });
    await waitFor(() => expect(sw).toBeChecked());
    calls.length = 0;
    fireEvent.click(sw);
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/rewards already held stay held/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    fireEvent.click(within(confirm).getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { enabled: false } }));
  });

  it("saves only what changed: the scoring, the hours and the leaderboard", async () => {
    render(<QuestsPage eventId={EVENT} />);
    await screen.findByRole("switch", { name: "Quests" });
    const save = within(screen.getByRole("region", { name: "Save" })).getByRole("button", { name: "Save settings" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Checkmarks" }));
    expect(screen.getByText(/Changing it changes what the milestones count/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quest starts"), { target: { value: "2026-11-28T09:00" } });
    fireEvent.change(screen.getByLabelText("Quest ends"), { target: { value: "2026-11-28T08:00" } });
    expect(screen.getByText("It must end after it starts.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quest ends"), { target: { value: "2026-11-28T18:00" } });
    fireEvent.click(screen.getByRole("switch", { name: "Leaderboard" }));
    fireEvent.change(screen.getByLabelText("Names on the board"), { target: { value: "full" } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toBeTruthy());
    const body = calls.find((c) => c.method === "PATCH")!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["ends_at", "leaderboard", "leaderboard_names", "mode", "starts_at"]);
    expect(body).toMatchObject({ mode: "checkmarks", leaderboard: true, leaderboard_names: "full" });
    expect(new Date(body.starts_at as string).getTime()).toBe(new Date("2026-11-28T09:00").getTime());
  });

  it("says when the API has no quests yet", async () => {
    state.routeMissing = true;
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("Quests are not here yet")).toBeInTheDocument();
  });
});

describe("tasks", () => {
  it("lists each task with its rule, points, required and how many have it", async () => {
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("Meet 5 people")).toBeInTheDocument();
    expect(screen.getByText(/5 people met either way by QR · at most 2 a minute/)).toBeInTheDocument();
    expect(screen.getByText("Scanned at Google Cloud booth")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("20 pts")).toBeInTheDocument();
    // A code is hidden until asked: screens get shared.
    expect(screen.queryByText("CLOUD24")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the code of Keynote code" }));
    expect(screen.getByText("CLOUD24")).toBeInTheDocument();
  });

  it("adds a Network task from its template, with the count, who counts and the per-minute limit", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add a task/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Met people in Network/ }));
    expect(within(dialog).getByLabelText("Title guests see")).toHaveValue("Meet 3 people");
    expect(within(dialog).getByText(/distinct people met by scanning a personal QR/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("People to meet"), { target: { value: "60" } });
    expect(within(dialog).getByText("At most 50.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add task" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("People to meet"), { target: { value: "5" } });
    const who = within(dialog).getByLabelText("Who counts");
    expect(within(who).getByRole("option", { name: "They saved them (scanned their QR)" })).toBeInTheDocument();
    fireEvent.change(who, { target: { value: "saved" } });
    fireEvent.change(within(dialog).getByLabelText("Points"), { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Required" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/quests/tasks"))).toBeTruthy());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      kind: "network",
      // The suggested title followed the count.
      title: "Meet 5 people",
      description: null,
      points: 25,
      required: true,
      starts_at: null,
      ends_at: null,
      config: { count: 5, direction: "saved", per_minute: 2 },
    });
  });

  it("makes a code task with a generated code, refusing one another task uses", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add a task/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Secret code/ }));
    const code = within(dialog).getByLabelText("The code");
    fireEvent.change(code, { target: { value: " cloud 24 " } });
    expect(within(dialog).getByText("Another code task already uses this code.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Generate/ }));
    expect((code as HTMLInputElement).value).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect((calls.find((c) => c.method === "POST")?.body as { config: { code: string } }).config.code).toBe((code as HTMLInputElement).value));
  });

  it("makes a new code only after asking", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "New code for Keynote code" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/The current code stops working at once/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Make a new code" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/quests/tasks/t3"))).toBeTruthy());
    const body = calls.find((c) => c.method === "PATCH")!.body as { config: { code: string } };
    expect(body.config.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(body.config.code).not.toBe("CLOUD24");
  });

  it("reorders and deletes a task", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Move Meet 5 people up" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toMatchObject({ body: { ids: ["t2", "t1", "t3", "t4"] } }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Meet 5 people" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/120 guests have it/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/quests/tasks/t2"))).toBe(true));
  });

  it("prints the code sheet: one code per page, large, with its hours", () => {
    const html = codeSheetHtml("DevFest <2026>", parsed().tasks, "points");
    expect(html).toContain('<p class="code">CLOUD24</p>');
    expect(html).toContain("DevFest &lt;2026&gt;");
    expect(html).toContain("15 points");
    expect(html).toContain("window.print()");
    expect(html.match(/class="page"/g)).toHaveLength(1);
  });

  it("generates readable codes and compares them as the server does", () => {
    for (let i = 0; i < 20; i++) expect(generateCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(normalizeCode(" Cloud 24 ")).toBe("cloud24");
    expect(codeProblem("ab", [])).toMatch(/At least 3/);
    expect(codeProblem("CLOUD 24", ["cloud24"])).toMatch(/Another code task/);
    expect(codeProblem("KEYNOTE", ["cloud24"])).toBeNull();
    expect(ruleLine({ kind: "network", config: { count: 3, direction: "saved_by", per_minute: 1 }, target: 3 })).toBe("3 people who saved them by QR · at most 1 a minute");
    const tpl = templatesSchema.parse(TEMPLATES);
    expect(suggestTitle("network", tpl, { count: "8", direction: "either", per_minute: "2" })).toBe("Meet 8 people");
    expect(suggestTitle("station", tpl, { door_id: "st1" }, parsed().stations)).toBe("Visit Google Cloud booth");
  });
});

describe("milestones and rewards", () => {
  it("shows each reward's stock: held, collected, free, by size", async () => {
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("At 30 points")).toBeInTheDocument();
    expect(screen.getByText("200 in stock")).toBeInTheDocument();
    expect(screen.getByText("41 held")).toBeInTheDocument();
    expect(screen.getByText("147 free")).toBeInTheDocument();
    expect(screen.getByText(/3 still to pick a size/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "By size" }));
    expect(screen.getByRole("cell", { name: "M" })).toBeInTheDocument();
  });

  it("adds a reward from the swag not already a reward, with what happens when it runs out", async () => {
    render(<QuestsPage eventId={EVENT} />);
    const picker = await screen.findByLabelText("Add a reward");
    // The T-shirt is already a reward: only the stickers are offered.
    expect(within(picker).queryByRole("option", { name: /DevFest T-shirt/ })).toBeNull();
    fireEvent.change(picker, { target: { value: "i2" } });
    fireEvent.change(screen.getByLabelText("When it runs out"), { target: { value: "first_come" } });
    expect(screen.getByText(/When none is left, the milestone shows it sold out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/milestones/m1/rewards"))).toMatchObject({ body: { merch_item_id: "i2", sold_out_mode: "first_come" } }));
  });

  it("changes a reward's sold-out behaviour", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.change(await screen.findByLabelText("When DevFest T-shirt runs out"), { target: { value: "first_come" } });
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/quests/rewards/rw1"))).toMatchObject({ body: { sold_out_mode: "first_come" } }));
  });

  it("refuses a threshold nobody could reach", () => {
    const q = parsed();
    expect(thresholdProblem(q, "0")).toMatch(/1 or more/);
    expect(thresholdProblem(q, "500")).toMatch(/worth 55 points/);
    expect(thresholdProblem({ ...q, mode: "checkmarks" }, "5")).toMatch(/only 4 tasks/);
    expect(thresholdProblem(q, "40")).toBeNull();
  });
});

describe("stations and swag desks", () => {
  it("lists each with its task, visits and door link", async () => {
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText(/^Ticks “Visit the Google Cloud booth” · 10 pts · link …ab12/)).toBeInTheDocument();
    expect(screen.getByText(/^visits · /)).toBeInTheDocument();
    expect(screen.getByText("Door link on")).toBeInTheDocument();
    // Rewards and no swag desk: where would guests collect?
    expect(screen.getByText(/There are rewards but no swag desk yet/)).toBeInTheDocument();
  });

  it("adds a station with its task and door link, and shows the link once", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add a station or desk/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Workshop A" } });
    fireEvent.change(within(dialog).getByLabelText("Points"), { target: { value: "15" } });
    fireEvent.change(within(dialog).getByLabelText("The link works for"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add station/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/quests/stations"))).toMatchObject({
        body: { name: "Workshop A", purpose: "station", task: { title: "Visit Workshop A", points: 15, required: false }, link: { days: 1 } },
      })
    );
    expect(await within(dialog).findByLabelText("Door link")).toHaveValue("https://clubs.myotherapp.in/gate/42?key=k-booth");
    expect(within(dialog).getByText(/ticks “Visit Workshop A”/)).toBeInTheDocument();
  });

  it("adds a swag desk with no task", async () => {
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add a station or desk/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Swag desk/ }));
    expect(within(dialog).queryByLabelText("Task title")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Swag desk" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add swag desk/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/quests/stations"))).toMatchObject({ body: { name: "Swag desk", purpose: "swag_desk", link: { days: 3 } } }));
    expect((calls.find((c) => c.path.endsWith("/quests/stations"))!.body as Record<string, unknown>).task).toBeUndefined();
  });
});

describe("while it runs", () => {
  it("shows the live numbers: people per task and milestone, unlocked against collected, stock left", async () => {
    on();
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("Taking part")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("60 collected · 150 still to collect")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Meet 5 people: 120 of 412" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Tier 1 · at 30 points: 210 of 412" })).toBeInTheDocument();
    expect(screen.getByText(/unlocked Tier 1/)).toBeInTheDocument();
    // The leaderboard is off: not read, not shown.
    expect(screen.queryByText("Ben Thomas")).toBeNull();
    expect(calls.some((c) => c.path.endsWith("/quests/leaderboard"))).toBe(false);
  });

  it("shows the leaderboard once it is on", async () => {
    state.quest = { ...structuredClone(QUEST), enabled: true, leaderboard: true };
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("Ben Thomas")).toBeInTheDocument();
    expect(screen.getByText(/guests see first names and an initial/)).toBeInTheDocument();
  });

  it("grants a task the platform can't see, with the reason, and revokes one", async () => {
    on();
    render(<QuestsPage eventId={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Asha Kumar" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Hackathon submitted")).toBeInTheDocument();
    expect(within(dialog).getByText(/Gave the lightning talk/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant Hackathon submitted" }));
    const grant = within(dialog).getByRole("button", { name: "Grant" });
    expect(grant).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Why (kept in the log)"), { target: { value: "Submitted at the desk" } });
    fireEvent.click(grant);
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/guests/r1/tasks/t5/grant"))).toMatchObject({ body: { note: "Submitted at the desk" } }));

    fireEvent.click(await within(dialog).findByRole("button", { name: "Revoke Check in" }));
    fireEvent.change(within(dialog).getByLabelText("Why (kept in the log)"), { target: { value: "Scanned a friend's ticket" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/guests/r1/tasks/t1/revoke"))).toMatchObject({ body: { note: "Scanned a friend's ticket" } }));
  });

  it("filters the guests and exports who earned what", async () => {
    on();
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText("Asha Kumar")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reward"), { target: { value: "collected" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/quests/guests") && c.options?.query?.claim_status === "collected")).toBe(true));
    fireEvent.keyDown(screen.getByRole("button", { name: /Export who earned what/ }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Excel/ })).toHaveAttribute("href", "/api/gateway/api/v1/events/42/quests/export?format=xlsx");
  });
});

describe("for door staff", () => {
  it("is read only, with no export", async () => {
    on();
    access.can = { edit_events: false, exports: false };
    render(<QuestsPage eventId={EVENT} />);
    expect(await screen.findByText(/Your role can see the quest and its numbers/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Quests" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Add a task/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add a station or desk/ })).toBeNull();
    expect(screen.queryByLabelText("Add a reward")).toBeNull();
    expect(await screen.findByText("Asha Kumar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export who earned what/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Count again" })).toBeNull();
  });
});

