import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * The quiz console against a server with rounds: the rounds themselves,
 * every question kind as the editor sends it, a round's rules, the host's
 * new controls, and winners. Every call says it is this release's console.
 */

type Call = { method: string; path: string; body?: unknown; headers?: Record<string, string> };
const calls: Call[] = [];

const SETTINGS = {
  scoring: { points: 1000, speed: "linear", speed_share: 0.5, steps: [{ until: 0.25, share: 1 }, { until: 0.5, share: 0.8 }, { until: 0.75, share: 0.6 }, { until: 1, share: 0.4 }], wrong_penalty: 0, allow_negative: false, streak_from: 0, streak_bonus: 100 },
  flow: { advance: "host", auto_seconds: 8, reveal: "time_up", board: "every", board_every: 3 },
  players: { names: "nickname", filter_names: false, late_join: true, one_per_ticket: false, anonymous_screen: false },
  teams: { mode: "off", score: "total", list: [] },
  ties: "join",
  overall: true,
};
const Q1 = { id: "q1", prompt: "Which planet has the most moons?", options: [{ key: "a", label: "Saturn" }, { key: "b", label: "Jupiter" }], correct_key: "a", seconds: 20, sort_order: 0, kind: "single", points: null, double: false, effective_points: 1000 };
const Q2 = { id: "q2", prompt: "Which are gas giants?", options: [{ key: "a", label: "Saturn" }, { key: "b", label: "Mars" }, { key: "c", label: "Jupiter" }], correct_key: null, correct_keys: ["a", "c"], multi_rule: "proportional", seconds: 30, sort_order: 1, kind: "multi", points: 2000, double: false, effective_points: 2000 };
const round = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, title, intro: null, status: "draft", join_code: null, current_index: -1, players: 0, questions: [Q1, Q2], sort_order: id === "r1" ? 0 : 1, settings: SETTINGS, round: { index: id === "r1" ? 0 : 1, count: 2 }, ...over });
const summary = (r: ReturnType<typeof round>) => ({ id: r.id, title: r.title, intro: null, status: r.status, sort_order: r.sort_order, questions: r.questions.length, players: r.players, join_code: r.join_code, settings: r.settings });

const host = (over: Record<string, unknown> = {}) => ({
  status: "live",
  join_code: "482913",
  title: "Warm-up",
  players: 12,
  current_index: 0,
  total: 2,
  question: { ...Q1, time_left: 14, answered: 9, counts: [{ key: "a", label: "Saturn", count: 6, correct: true }, { key: "b", label: "Jupiter", count: 3, correct: false }], kind: "single", effective_points: 1000, revealed: false },
  leaderboard: [{ rank: 1, name: "Kavya R.", score: 940 }],
  quiz_id: "r1",
  round: { index: 0, count: 2 },
  phase: "question",
  paused: false,
  board_now: false,
  next_at: null,
  settings: SETTINGS,
  teams: null,
  overall: null,
  ...over,
});

const state: { rounds: Record<string, ReturnType<typeof round>>; host: Record<string, unknown>; winners: unknown[] } = { rounds: {}, host: host(), winners: [] };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown, options?: { headers?: Record<string, string> }) => {
      calls.push({ method, path, body, headers: options?.headers });
      const rest = path.replace("/api/v1/events/37/live", "");
      if (method === "POST" && rest === "/quizzes") return round("r3", "Round 3");
      if (method === "PUT" && rest === "/quizzes/order") return Object.values(state.rounds).map(summary).reverse();
      if (/\/quizzes\/r\d\/questions$/.test(rest)) return { id: "q9", sort_order: 2, effective_points: 1000, ...(body as object) };
      if (/\/quizzes\/r\d\/questions\/order$/.test(rest)) return state.rounds.r1;
      if (/\/quizzes\/r\d\/questions\/q\d$/.test(rest)) return { ...Q1, ...(body as object) };
      if (/\/quizzes\/r\d\/host\//.test(rest)) return state.host;
      if (/\/quizzes\/r\d\/winners\/mark$/.test(rest))
        return { marked: [{ rank: 1, name: "Kavya R.", registration_id: "reg1", position: 1 }], skipped: [{ rank: 2, name: "Guest 42", reason: "no_registration" }] };
      if (/\/quizzes\/r\d$/.test(rest)) return { ...state.rounds.r1, ...(body as object) };
      return {};
    });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { headers?: Record<string, string>; query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, headers: options?.headers });
        const rest = path.replace("/api/v1/events/37/live", "");
        if (rest === "/quiz") return state.rounds.r1;
        if (rest === "/quizzes") return Object.values(state.rounds).map(summary);
        const m = /^\/quizzes\/(r\d)$/.exec(rest);
        if (m) return state.rounds[m[1]!];
        if (/^\/quizzes\/r\d\/host$/.test(rest)) return state.host;
        if (/^\/quizzes\/r\d\/winners$/.test(rest)) return state.winners;
        if (rest === "/leaderboard") return [{ rank: 1, name: "Kavya R.", score: 9100, rounds: 2, saved_ms: 51000, registration: null }];
        if (path === "/api/v1/events/info/37") return { id: 37, name: "Space Night", slug: "space-night" };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      patch: write("PATCH"),
      put: write("PUT"),
      del: write("DELETE"),
    },
  };
});

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { exportChoices } = await import("@/test/export-menu");
const { QuizPanel } = await import("./components/quiz-panel");

beforeEach(() => {
  calls.length = 0;
  store.clear();
  state.rounds = { r1: round("r1", "Warm-up"), r2: round("r2", "Finals", { questions: [] }) };
  state.host = host();
  state.winners = [];
  vi.restoreAllMocks();
});

const sent = (method: string, suffix: string) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));

describe("rounds", () => {
  it("lists the rounds, opens the first, and opens another when it is picked", async () => {
    render(<QuizPanel eventId={37} />);
    const bar = await screen.findByRole("group", { name: "Quiz rounds" });
    expect(within(bar).getByRole("button", { name: /Warm-up/ })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Which planet has the most moons?")).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: /Finals/ }));
    expect(await screen.findByText("No questions yet")).toBeInTheDocument();
    expect(sent("GET", "/live/quizzes/r2")).toHaveLength(1);
  });

  it("opens the live round first", async () => {
    state.rounds.r2 = round("r2", "Finals", { status: "live", join_code: "482913" });
    state.host = host({ quiz_id: "r2", phase: "lobby", question: null, current_index: -1 });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByLabelText("Join code 482913")).toBeInTheDocument();
    expect(sent("GET", "/live/quizzes/r2/host").length).toBeGreaterThan(0);
  });

  it("adds a round and opens it, and moves the open one later", async () => {
    render(<QuizPanel eventId={37} />);
    const bar = await screen.findByRole("group", { name: "Quiz rounds" });
    fireEvent.click(within(bar).getByRole("button", { name: "Move this round later" }));
    await waitFor(() => expect(sent("PUT", "/live/quizzes/order")[0]?.body).toEqual({ ids: ["r2", "r1"] }));
    fireEvent.click(within(bar).getByRole("button", { name: /Add a round/ }));
    await waitFor(() => expect(sent("POST", "/live/quizzes")[0]?.body).toEqual({}));
  });

  it("removes a round once the host confirms", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Warm-up" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove the round" }));
    await waitFor(() => expect(sent("DELETE", "/live/quizzes/r1")).toHaveLength(1));
  });

  it("with one round, offers a second without a bar of rounds", async () => {
    state.rounds = { r1: round("r1", "Warm-up", { round: { index: 0, count: 1 } }) };
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText(/Several rounds tonight\?/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Quiz rounds" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a round" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes")).toHaveLength(1));
  });

  it("says it is this release's console on every call", async () => {
    render(<QuizPanel eventId={37} />);
    await screen.findByDisplayValue("Which planet has the most moons?");
    const live = calls.filter((c) => c.path.includes("/live/"));
    expect(live.length).toBeGreaterThan(2);
    for (const c of live) expect(c.headers).toEqual({ "X-Live-Version": "2" });
  });
});

describe("questions of every kind", () => {
  const add = async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
  };
  const answers = () => screen.getAllByLabelText(/^Answer \d$/).slice(-4);

  it("shows a saved question's kind, its right answers and its own points", async () => {
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByLabelText("Kind of question 2")).toHaveValue("multi");
    expect(screen.getByRole("button", { name: "Answer 1 is a right one" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Partial credit" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Points for question 2, empty for the round's")).toHaveValue(2000);
    expect(screen.getByText(/1000 points · faster scores more · you move it on/)).toBeInTheDocument();
  });

  it("sends several right answers and how a partly right one scores", async () => {
    await add();
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "multi" } });
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Which have rings?" } });
    fireEvent.change(answers()[0]!, { target: { value: "Saturn" } });
    fireEvent.change(answers()[1]!, { target: { value: "Mars" } });
    fireEvent.change(answers()[2]!, { target: { value: "Uranus" } });
    // The first is marked when the kind changes; mark the third too.
    fireEvent.click(screen.getAllByRole("button", { name: "Mark answer 3 as right" }).at(-1)!);
    fireEvent.click(screen.getAllByRole("radio", { name: "Wrong picks subtract" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(1));
    expect(sent("POST", "/live/quizzes/r1/questions")[0]!.body).toEqual({
      kind: "multi",
      prompt: "Which have rings?",
      options: [{ key: "a", label: "Saturn" }, { key: "b", label: "Mars" }, { key: "c", label: "Uranus" }],
      correct_keys: ["a", "c"],
      multi_rule: "subtract",
      seconds: 20,
    });
  });

  it("sends a typed answer with every spelling that counts, and how close it must be", async () => {
    await add();
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "type" } });
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Name the red planet" } });
    fireEvent.change(screen.getByLabelText("Accepted answers for question 3, one per line"), { target: { value: "Mars\n  mars \nThe red planet\n" } });
    fireEvent.click(screen.getAllByRole("radio", { name: "Close enough" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(1));
    expect(sent("POST", "/live/quizzes/r1/questions")[0]!.body).toEqual({ kind: "type", prompt: "Name the red planet", options: [], accepted: ["Mars", "mars", "The red planet"], match: "close", seconds: 20 });
  });

  it("will not save a typed question with nothing that counts", async () => {
    await add();
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "type" } });
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Name the red planet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText("List at least one answer that counts.")).toBeInTheDocument();
    expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(0);
  });

  it("sends true or false, an order in the right order, and a poll with no right answer", async () => {
    await add();
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "true_false" } });
    expect(answers().slice(-2).map((a) => (a as HTMLInputElement).value)).toEqual(["True", "False"]);
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Venus spins backwards" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Mark answer 2 as right" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(1));
    expect(sent("POST", "/live/quizzes/r1/questions")[0]!.body).toEqual({ kind: "true_false", prompt: "Venus spins backwards", options: [{ key: "a", label: "True" }, { key: "b", label: "False" }], correct_key: "b", seconds: 20 });

    calls.length = 0;
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "order" } });
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Closest to the Sun first" } });
    fireEvent.change(answers()[0]!, { target: { value: "Venus" } });
    fireEvent.change(answers()[1]!, { target: { value: "Mercury" } });
    fireEvent.change(answers()[2]!, { target: { value: "Earth" } });
    // Mercury goes first: move it up.
    fireEvent.click(screen.getAllByRole("button", { name: "Move answer 2 up" }).at(-1)!);
    fireEvent.click(screen.getAllByRole("radio", { name: "Credit for each in place" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(1));
    expect(sent("POST", "/live/quizzes/r1/questions")[0]!.body).toEqual({
      kind: "order",
      prompt: "Closest to the Sun first",
      options: [{ key: "a", label: "Mercury" }, { key: "b", label: "Venus" }, { key: "c", label: "Earth" }],
      order_rule: "partial",
      seconds: 20,
    });

    calls.length = 0;
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText("Kind of question 3"), { target: { value: "poll" } });
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Favourite planet?" } });
    fireEvent.change(answers()[0]!, { target: { value: "Saturn" } });
    fireEvent.change(answers()[1]!, { target: { value: "Earth" } });
    // A poll has no right answer to mark.
    const editor = screen.getByLabelText("Question 3").closest<HTMLElement>("[data-slot=figure-panel]")!;
    expect(within(editor).queryAllByRole("button", { name: /as right/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/questions")).toHaveLength(1));
    expect(sent("POST", "/live/quizzes/r1/questions")[0]!.body).toEqual({ kind: "poll", prompt: "Favourite planet?", options: [{ key: "a", label: "Saturn" }, { key: "b", label: "Earth" }], seconds: 20 });
  });

  it("gives a question its own points and double points, and takes them back", async () => {
    render(<QuizPanel eventId={37} />);
    await screen.findByDisplayValue("Which planet has the most moons?");
    fireEvent.click(screen.getByRole("button", { name: "Points for question 1" }));
    const points = screen.getByLabelText("Points for question 1, empty for the round's");
    fireEvent.change(points, { target: { value: "1500" } });
    const first = screen.getByLabelText("Question 1").closest<HTMLElement>("[data-slot=figure-panel]")!;
    fireEvent.click(within(first).getByRole("button", { name: "Double points" }));
    expect(screen.getByText("Worth 3000 points at most.")).toBeInTheDocument();
    fireEvent.blur(points);
    await waitFor(() => expect(sent("PATCH", "/live/quizzes/r1/questions/q1").at(-1)?.body).toEqual({ ...{ prompt: Q1.prompt, options: Q1.options, correct_key: "a", seconds: 20 }, points: 1500, double: true }));

    calls.length = 0;
    // Question 2 has its own 2000: emptying the field sends it back to the round's.
    const second = screen.getByLabelText("Points for question 2, empty for the round's");
    fireEvent.change(second, { target: { value: "" } });
    fireEvent.blur(second);
    await waitFor(() => expect(sent("PATCH", "/live/quizzes/r1/questions/q2")).toHaveLength(1));
    expect(sent("PATCH", "/live/quizzes/r1/questions/q2")[0]!.body).toMatchObject({ kind: "multi", points: null });
  });

  it("changes a saved question's kind and says so", async () => {
    render(<QuizPanel eventId={37} />);
    const kind = await screen.findByLabelText("Kind of question 1");
    fireEvent.change(kind, { target: { value: "poll" } });
    fireEvent.blur(kind);
    await waitFor(() => expect(sent("PATCH", "/live/quizzes/r1/questions/q1")).toHaveLength(1));
    expect(sent("PATCH", "/live/quizzes/r1/questions/q1")[0]!.body).toEqual({ kind: "poll", prompt: Q1.prompt, options: Q1.options, seconds: 20 });
  });

  it("puts the questions in a new order", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Move question 2 up" }));
    await waitFor(() => expect(sent("PUT", "/live/quizzes/r1/questions/order")[0]?.body).toEqual({ ids: ["q2", "q1"] }));
    expect(screen.getByRole("button", { name: "Move question 1 up" })).toBeDisabled();
  });
});

describe("a round's rules", () => {
  it("sends only what changed, section by section", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Rules/ }));
    expect(await screen.findByText("Rules for Warm-up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "No bonus" }));
    fireEvent.click(screen.getByRole("radio", { name: "Loses 25%" }));
    fireEvent.click(screen.getByRole("radio", { name: "When I reveal it" }));
    fireEvent.click(screen.getByRole("radio", { name: "Players pick" }));
    fireEvent.change(screen.getByLabelText("Name of team 1"), { target: { value: "Red Rockets" } });
    fireEvent.click(screen.getByRole("radio", { name: "Faster wins" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(sent("PATCH", "/live/quizzes/r1")).toHaveLength(1));
    expect(sent("PATCH", "/live/quizzes/r1")[0]!.body).toEqual({
      settings: {
        scoring: { speed: "off", wrong_penalty: 0.25 },
        flow: { reveal: "host" },
        teams: { mode: "pick", list: [{ key: "team-1", name: "Red Rockets", color: "#DC2626" }, { key: "team-2", name: "Blue", color: "#2563EB" }] },
        ties: "time",
      },
    });
  });

  it("will not save teams without two names", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Rules/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Assigned" }));
    fireEvent.change(screen.getByLabelText("Name of team 2"), { target: { value: " " } });
    expect(screen.getByText("Name at least two teams.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
  });
});

describe("hosting a round", () => {
  beforeEach(() => {
    state.rounds.r1 = round("r1", "Warm-up", { status: "live", join_code: "482913" });
  });

  it("pauses an open question and skips it once the host confirms", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/pause")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(await screen.findByText("Skip this question?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip it" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/skip")).toHaveLength(1));
  });

  it("resumes a paused question", async () => {
    state.host = host({ phase: "paused", paused: true });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Paused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/resume")).toHaveLength(1));
  });

  it("reveals the answer when the round waits for the host", async () => {
    state.host = host({ phase: "closed", settings: { ...SETTINGS, flow: { ...SETTINGS.flow, reveal: "host" } }, question: { ...host().question, time_left: 0 } });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Answers in")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal the answer" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/reveal")).toHaveLength(1));
  });

  it("asks the question again, or an earlier one", async () => {
    state.host = host({ phase: "revealed", current_index: 1, question: { ...host().question, time_left: 0 } });
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ask it again/ }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/reopen")[0]?.body).toEqual({ index: 1 }));
    fireEvent.change(screen.getByLabelText("Ask an earlier question again"), { target: { value: "0" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Open it" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/host/reopen")[1]?.body).toEqual({ index: 0 }));
  });

  it("says when a round moves on by itself", async () => {
    state.host = host({ phase: "revealed", next_at: new Date(Date.now() + 6_000).toISOString(), settings: { ...SETTINGS, flow: { ...SETTINGS.flow, advance: "auto" } }, question: { ...host().question, time_left: 0 } });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText(/Moves on by itself in [56] s/)).toBeInTheDocument();
  });

  it("shows each kind's tally: what the room typed, and an order's right places", async () => {
    state.host = host({ question: { ...host().question, kind: "type", options: [], counts: [], accepted: ["Mars"], texts: [{ text: "mars", count: 7, correct: true }, { text: "venus", count: 2, correct: false }] } });
    render(<QuizPanel eventId={37} />);
    const typed = await screen.findByRole("list", { name: "What the room typed" });
    expect(within(typed).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["mars7", "venus2"]);
    expect(screen.getByText("Mars")).toBeInTheDocument();
  });

  it("shows the teams beside the board", async () => {
    state.host = host({ teams: [{ key: "red", name: "Red Rockets", color: "#E11D48", players: 6, score: 4200, rank: 1 }], leaderboard: [{ rank: 1, name: "Kavya R.", score: 940, team: "red" }] });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Red Rockets")).toBeInTheDocument();
    expect(screen.getByText("6 playing")).toBeInTheDocument();
    expect(screen.getByLabelText("Red Rockets")).toBeInTheDocument();
  });

  it("calls an end a round's end when the event has several", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "End early" }));
    expect(await screen.findByText("End the round now?")).toBeInTheDocument();
  });
});

describe("winners", () => {
  beforeEach(() => {
    state.rounds.r1 = round("r1", "Warm-up", { status: "ended" });
    state.host = host({ status: "ended", phase: "ended", question: null, leaderboard: [{ rank: 1, name: "Kavya R.", score: 4820 }] });
    state.winners = [
      { rank: 1, name: "Kavya R.", score: 4820, correct: 7, time_ms: 84210, team: null, player_id: "p1", registration: { id: "reg1", full_name: "Kavya Raman", ticket_id: "MOA1", position: null } },
      { rank: 2, name: "Guest 42", score: 4610, correct: 6, time_ms: 90100, team: null, player_id: "p2", registration: null },
    ];
  });

  it("lists the top players with their registrations, exports them and marks them once the host confirms", async () => {
    const said = vi.spyOn(toast, "success");
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Kavya Raman")).toBeInTheDocument();
    expect(screen.getByText("84.2 s")).toBeInTheDocument();
    expect(screen.getByText("Played without one")).toBeInTheDocument();
    const { xlsx, csv } = await exportChoices(/^Export/);
    expect(xlsx).toHaveAttribute("href", "/api/gateway/api/v1/events/37/live/quizzes/r1/winners/export?top=3&format=xlsx");
    expect(csv).toHaveAttribute("href", "/api/gateway/api/v1/events/37/live/quizzes/r1/winners/export?top=3");

    fireEvent.click(screen.getByRole("button", { name: "Mark as winners" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark 3 winners" }));
    await waitFor(() => expect(sent("POST", "/live/quizzes/r1/winners/mark")[0]?.body).toEqual({ top: 3 }));
    expect(await screen.findByText(/Marked: 1\. Kavya R\./)).toBeInTheDocument();
    expect(screen.getByText(/Not marked \(played without a registration\): 2\. Guest 42/)).toBeInTheDocument();
    expect(said).toHaveBeenCalledWith("1 winner marked on their registrations");
  });

  it("asks for more winners when the host wants a longer list", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.change(await screen.findByLabelText("How many winners"), { target: { value: "10" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/live/quizzes/r1/winners"))).toBe(true));
    expect(await screen.findByRole("button", { name: "Mark as winners" })).toBeEnabled();
  });

  it("shows the board across the rounds", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Board across the rounds/ }));
    expect(await screen.findByText("Winners across the rounds")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Kavya R.")).toBeInTheDocument();
    expect(within(dialog).getByText("9100")).toBeInTheDocument();
  });
});
