import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";

/**
 * The big screen and the presenter drawn by the stage: an event's theme,
 * every question kind and phase of a round, the boards (teams, podium,
 * across the rounds), polls in each chart, the Q&A wall, idle slides, the
 * ticker and the join panel. An event that never saved a theme and keeps
 * the screen's controls as they were is drawn by the old screens
 * (feedback-and-screen.test, present.test), unchanged.
 */

const EVENT = { id: 37, name: "Space Night", slug: "space-night", status: "live", status_clock: true, poster: null, event_datetime: "2026-11-29T13:00:00Z", club: { id: 3, name: "Astro Club", slug: "astro", logo: null } };

const state: { screen: Record<string, unknown> } = { screen: {} };
const gets: Array<{ path: string; options?: { headers?: Record<string, string> } }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { headers?: Record<string, string> }) => {
        gets.push({ path, options });
        if (path === "/api/v1/events/37/live/screen") return state.screen;
        if (path === "/api/v1/events/info/37") return EVENT;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

const { render } = await import("@/test/render");
const { ScreenPage } = await import("./components/screen-page");
const { PresentPage } = await import("./components/present-page");
const { usesStage } = await import("./components/stage-page");
const { IdleSlides } = await import("./stage/room");
const { presetDraft, resolveDraft } = await import("./theme");

const logo = { id: "m1", kind: "logo", thumbnail: "https://cdn.test/t.png", medium: "https://cdn.test/m.png", large: "https://cdn.test/l.png", original: "https://cdn.test/o.png" };
const theme = (over: Partial<ReturnType<typeof presetDraft>> = {}) =>
  resolveDraft({ ...presetDraft("club", { brand_primary: "#F2AA4C", logo: false }), logo: "m1", ...over }, { m1: logo }, null);
const CONTROL = { mode: "auto", results: "live", ticker: false, idle_slides: [], slide_seconds: 12, wall_size: 6 };
const BOARD = [
  { rank: 1, name: "Kavya R.", score: 4820, team: "red" },
  { rank: 2, name: "Arjun M.", score: 4610, team: "blue" },
  { rank: 3, name: "Nila S.", score: 4455, team: "red" },
  { rank: 4, name: "Rahul P.", score: 4120, team: "blue" },
];
const TEAMS = [
  { key: "red", name: "Red Rockets", color: "#E11D48", players: 40, score: 9275, rank: 1 },
  { key: "blue", name: "Blue Comets", color: "#2563EB", players: 38, score: 8730, rank: 2 },
];
const OPTIONS = [
  { key: "a", label: "Saturn" },
  { key: "b", label: "Jupiter" },
  { key: "c", label: "Uranus" },
  { key: "d", label: "Neptune" },
];
const question = (over: Record<string, unknown> = {}) => ({
  id: "q3",
  prompt: "Which planet has the most known moons?",
  options: OPTIONS,
  correct_key: null,
  seconds: 20,
  time_left: 12,
  answered: 54,
  counts: OPTIONS.map((o, i) => ({ ...o, count: [31, 17, 3, 3][i]!, correct: false })),
  kind: "single",
  effective_points: 1000,
  ...over,
});
const quiz = (over: Record<string, unknown> = {}) => ({
  status: "live",
  join_code: "482913",
  title: "Space quiz",
  players: 86,
  current_index: 2,
  total: 8,
  question: question(),
  leaderboard: [],
  phase: "question",
  round: { index: 0, count: 1 },
  board_now: false,
  ...over,
});
const themed = (over: Record<string, unknown> = {}) => ({
  event: { id: 37, name: "Space Night" },
  pinned: null,
  board: [],
  poll: null,
  quiz: quiz(),
  update: null,
  theme: theme(),
  theme_custom: true,
  theme_version: "a91c3f02",
  control: CONTROL,
  shows: "quiz",
  wall: [],
  updates: [],
  agenda: [],
  sponsors: [],
  overall: null,
  ...over,
});

beforeEach(() => {
  gets.length = 0;
  state.screen = themed();
});
afterEach(() => vi.useRealTimers());

const stage = () => document.querySelector<HTMLElement>("[data-theme]");

describe("which screen draws it", () => {
  it("keeps the old screens for an event with no theme, today's controls and today's rules", () => {
    const base = { event: { id: 37, name: "x" }, pinned: null, board: [], poll: null, quiz: null, update: null };
    expect(usesStage(base)).toBe(false);
    expect(usesStage({ ...base, theme_custom: false, control: CONTROL as never })).toBe(false);
    expect(usesStage({ ...base, theme_custom: true })).toBe(true);
    expect(usesStage({ ...base, control: { ...CONTROL, ticker: true } as never })).toBe(true);
    expect(usesStage({ ...base, control: { ...CONTROL, results: "hidden" } as never })).toBe(true);
    const teams = { scoring: {}, flow: { reveal: "time_up" }, teams: { mode: "pick" } };
    expect(usesStage({ ...base, quiz: { ...quiz(), settings: teams } as never })).toBe(true);
  });

  it("asks the screen as this release's console, with X-Live-Version: 2", async () => {
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    expect(gets.find((g) => g.path.endsWith("/live/screen"))?.options?.headers).toEqual({ "X-Live-Version": "2" });
  });

  it("draws the stage in the screen's own colours when only the controls changed", async () => {
    state.screen = themed({ theme_custom: false, control: { ...CONTROL, ticker: true }, updates: [{ id: "u1", kind: "general", text: "Pizza at 8:30", audience: "checked_in", recipients: 1, pushed: 1, sent_at: "2026-11-29T13:00:00Z" }] });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    expect(stage()).toHaveAttribute("data-theme", "own");
    expect(stage()!.style.getPropertyValue("--lt-bg")).toBe("var(--canvas)");
  });
});

describe("the theme on the big screen", () => {
  it("paints its colours and fonts, shows its logo, and marks each answer with a shape a colour-blind player can read", async () => {
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    const root = stage()!;
    expect(root).toHaveAttribute("data-theme", "club");
    expect(root.style.getPropertyValue("--lt-accent")).toBe("#F2AA4C");
    expect(root.style.getPropertyValue("--lt-a0")).toBe("#DC2626");
    expect(root.style.getPropertyValue("--lt-font-display")).toContain("DM Sans");
    expect(document.querySelector('img[src="https://cdn.test/l.png"]')).not.toBeNull();
    const tiles = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Saturn") || li.textContent?.includes("Jupiter"));
    expect(tiles[0]).toHaveTextContent("triangle: Saturn");
    expect(tiles[1]).toHaveTextContent("diamond: Jupiter");
    // Live results: the counts fill in as the room answers.
    expect(tiles[0]).toHaveTextContent("31");
    expect(screen.getByText("54 of 86 answered")).toBeInTheDocument();
    // The timer, as the theme draws it (a bar by default).
    expect(screen.getByRole("timer")).toHaveAccessibleName("12 seconds left");
  });

  it("uses letters, a ring and a single column when the theme says so, and waits for the reveal with question-only results", async () => {
    state.screen = themed({ theme: theme({ answers: { style: "letters" }, timer: "ring", screen: { ...presetDraft("club").screen, answer_layout: "column" } }), control: { ...CONTROL, results: "hidden" } });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    const saturn = screen.getAllByRole("listitem").find((li) => li.textContent?.includes("Saturn"))!;
    expect(saturn).toHaveTextContent("A: Saturn");
    expect(saturn).not.toHaveTextContent("31");
    expect(screen.getByRole("timer").querySelector("svg")).not.toBeNull();
    expect(saturn.parentElement).toHaveClass("grid-cols-1");
  });

  it("hides the clock when the theme says hidden", async () => {
    state.screen = themed({ theme: theme({ timer: "hidden" }) });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("puts the join QR, the address and the code in a corner, or full screen in the lobby, or nowhere", async () => {
    render(<PresentPage eventId={37} />);
    expect(await screen.findByAltText("QR code to join the live room at myotherapp.in/events/space-night/live")).toBeInTheDocument();
    expect(screen.getByText("Late? Scan to join")).toBeInTheDocument();
    expect(screen.getByLabelText("Quiz code 482913")).toBeInTheDocument();
  });

  it("fills the lobby with the way in when the theme asks for it there", async () => {
    state.screen = themed({ theme: theme({ screen: { ...presetDraft("club").screen, join: "lobby" } }), quiz: quiz({ question: null, phase: "lobby", current_index: -1 }) });
    render(<PresentPage eventId={37} />);
    expect(await screen.findByLabelText("Join code 482913")).toBeInTheDocument();
    expect(await screen.findByText("Scan to join")).toBeInTheDocument();
    expect(screen.getByText("86 players in")).toBeInTheDocument();
  });

  it("shows no way in when the theme hides it", async () => {
    state.screen = themed({ theme: theme({ screen: { ...presetDraft("club").screen, join: "hidden" } }) });
    render(<PresentPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    expect(screen.queryByText(/Scan to join/)).toBeNull();
  });
});

describe("a round, phase by phase", () => {
  it("marks the right answer once revealed, and puts the board and the teams beside it when the round says so", async () => {
    state.screen = themed({
      quiz: quiz({
        phase: "revealed",
        board_now: true,
        leaderboard: BOARD,
        teams: TEAMS,
        question: question({ time_left: 0, counts: OPTIONS.map((o, i) => ({ ...o, count: [46, 28, 4, 3][i]!, correct: o.key === "a" })) }),
      }),
    });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Which planet has the most known moons?");
    expect(screen.getByLabelText("Right answer").closest("li")).toHaveAttribute("data-correct", "true");
    const board = screen.getByRole("region", { name: "Leaderboard" });
    expect(within(board).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Kavya R.4820", "2Arjun M.4610", "3Nila S.4455", "4Rahul P.4120"]);
    expect(within(board).getAllByLabelText("Red Rockets")).toHaveLength(2);
    const teams = screen.getByRole("region", { name: "Teams" });
    expect(teams).toHaveTextContent("Red Rockets");
    expect(teams).toHaveTextContent("9275");
  });

  it("keeps the board to the theme's size", async () => {
    state.screen = themed({ quiz: quiz({ phase: "revealed", board_now: true, leaderboard: [...BOARD, ...BOARD.map((b) => ({ ...b, rank: b.rank + 4, name: `${b.name} II` }))], question: question({ time_left: 0 }) }) });
    render(<ScreenPage eventId={37} />);
    const board = await screen.findByRole("region", { name: "Leaderboard" });
    expect(within(board).getAllByRole("listitem")).toHaveLength(5);
  });

  it("says when the host paused the clock, and when answers are in and the reveal is next", async () => {
    state.screen = themed({ quiz: quiz({ phase: "paused", paused: true }) });
    const { unmount } = render(<ScreenPage eventId={37} />);
    expect(await screen.findByRole("status")).toHaveTextContent("Paused");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Paused at 12 seconds");
    unmount();
    state.screen = themed({ quiz: quiz({ phase: "closed", question: question({ time_left: 0 }) }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByRole("status")).toHaveTextContent("Answers are in — the answer is next");
  });

  it("asks a typed question on the phones, then shows the answer and what the room typed", async () => {
    state.screen = themed({ quiz: quiz({ question: question({ kind: "type", options: [], counts: [] }) }) });
    const { unmount } = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Type your answer on your phone")).toBeInTheDocument();
    unmount();
    state.screen = themed({
      quiz: quiz({
        phase: "revealed",
        question: question({ kind: "type", options: [], counts: [], time_left: 0, accepted: ["Saturn", "saturn planet"], fully_correct: 41, texts: [{ text: "saturn", count: 39, correct: true }, { text: "jupiter", count: 12, correct: false }] }),
      }),
    });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Saturn")).toBeInTheDocument();
    expect(screen.getByText("Also right: saturn planet")).toBeInTheDocument();
    const typed = screen.getByRole("list", { name: "What the room typed" });
    expect(within(typed).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["saturn39", "jupiter12"]);
    expect(screen.getByText(/41 got it fully right/)).toBeInTheDocument();
  });

  it("shows an order shuffled while it runs and the right order after", async () => {
    const shuffled = [OPTIONS[2]!, OPTIONS[0]!, OPTIONS[3]!, OPTIONS[1]!];
    state.screen = themed({ quiz: quiz({ question: question({ kind: "order", options: shuffled, counts: shuffled.map((o) => ({ ...o, count: 0, correct: false })) }) }) });
    const { unmount } = render(<ScreenPage eventId={37} />);
    await screen.findByText("Put these in order on your phone");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent).slice(0, 4)).toEqual(["11. Uranus", "22. Saturn", "33. Neptune", "44. Jupiter"]);
    unmount();
    state.screen = themed({
      quiz: quiz({ phase: "revealed", question: question({ kind: "order", time_left: 0, options: shuffled, correct_order: ["a", "b", "c", "d"], counts: OPTIONS.map((o) => ({ ...o, count: 20, correct: true })) }) }),
    });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("Put these in order on your phone");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent).slice(0, 4)).toEqual(["11. Saturn20", "22. Jupiter20", "33. Uranus20", "44. Neptune20"]);
  });

  it("marks every right answer of a several-answers question, and none of a poll question", async () => {
    state.screen = themed({
      quiz: quiz({ phase: "revealed", question: question({ kind: "multi", time_left: 0, correct_keys: ["a", "b"], counts: OPTIONS.map((o) => ({ ...o, count: 9, correct: o.key !== "c" && o.key !== "d" })) }) }),
    });
    const { unmount } = render(<ScreenPage eventId={37} />);
    expect(await screen.findAllByLabelText("Right answer")).toHaveLength(2);
    expect(screen.getByText("Pick every right answer")).toBeInTheDocument();
    unmount();
    state.screen = themed({ quiz: quiz({ phase: "revealed", question: question({ kind: "poll", time_left: 0 }) }) });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("No right answer — tell us what you think");
    expect(screen.queryByLabelText("Right answer")).toBeNull();
  });

  it("ends on a podium, the rest of the board, the teams and the board across the rounds", async () => {
    state.screen = themed({
      quiz: quiz({
        status: "ended",
        phase: "ended",
        question: null,
        title: "Round 2",
        round: { index: 1, count: 3 },
        leaderboard: BOARD,
        teams: TEAMS,
        overall: [{ rank: 1, name: "Arjun M.", score: 9900, rounds: 2, saved_ms: 51000 }],
      }),
    });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("That's Round 2")).toBeInTheDocument();
    const podium = screen.getByRole("region", { name: "Podium" });
    // 2 · 1 · 3 on the steps.
    expect(within(podium).getAllByLabelText(/Place \d/).map((el) => el.textContent)).toEqual(["2", "1", "3"]);
    expect(screen.getByRole("region", { name: "And the rest" })).toHaveTextContent("Rahul P.");
    expect(screen.getByRole("region", { name: "Teams" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Across the rounds" })).toHaveTextContent("Arjun M.2 rounds9900");
  });

  it("ends on a plain board when the theme has no podium", async () => {
    state.screen = themed({ theme: theme({ leaderboard: { size: 10, podium: false, animate: false, own_rank: true } }), quiz: quiz({ status: "ended", phase: "ended", question: null, leaderboard: BOARD }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("That's the quiz")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Podium" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Leaderboard" })).getAllByRole("listitem")).toHaveLength(4);
  });
});

const poll = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  kind: "choice",
  prompt: "Pick tonight's pizza",
  options: ["Margherita", "Paneer tikka", "Veggie supreme"],
  status: "live",
  sort_order: 0,
  results: { responses: 64, choices: [{ label: "Margherita", count: 21, pct: 33 }, { label: "Paneer tikka", count: 25, pct: 39 }, { label: "Veggie supreme", count: 18, pct: 28 }] },
  settings: { chart: "bar", show: "both" },
  ...over,
});

describe("a poll on the big screen", () => {
  it("draws bars with percent and count, or what the poll says to show", async () => {
    state.screen = themed({ quiz: null, shows: "poll", poll: poll() });
    const { unmount } = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Pick tonight's pizza")).toBeInTheDocument();
    expect(screen.getByText("39% · 25")).toBeInTheDocument();
    expect(screen.getByText(/Poll · 64 answered/)).toBeInTheDocument();
    unmount();
    state.screen = themed({ quiz: null, shows: "poll", poll: poll({ settings: { chart: "column", show: "count" } }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("25")).toBeInTheDocument();
  });

  it("draws a donut", async () => {
    state.screen = themed({ quiz: null, shows: "poll", poll: poll({ settings: { chart: "donut", show: "percent" } }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByRole("img", { name: "Results as a donut" })).toBeInTheDocument();
    expect(screen.getByText("39%")).toBeInTheDocument();
  });

  it("holds the results back while they are hidden from the screen", async () => {
    state.screen = themed({ quiz: null, shows: "poll", control: { ...CONTROL, results: "hidden" }, poll: poll({ results: { responses: 64 } }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Vote on your phone — the results show when the poll closes.")).toBeInTheDocument();
  });

  it("draws a rating, a ranking, open text and a word cloud", async () => {
    state.screen = themed({
      quiz: null,
      shows: "poll",
      poll: poll({ kind: "rating", options: [], settings: { scale: 10, style: "numbers" }, results: { responses: 30, rating: { average: 8.4, scale: 10, histogram: [{ value: 10, count: 12, pct: 40 }] } } }),
    });
    const r1 = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("8.4")).toBeInTheDocument();
    expect(screen.getByText(/out of 10/)).toBeInTheDocument();
    r1.unmount();
    state.screen = themed({ quiz: null, shows: "poll", poll: poll({ kind: "ranking", results: { responses: 12, ranking: [{ label: "Paneer tikka", average: 1.4, points: 30, first: 8 }, { label: "Margherita", average: 2.1 }] } }) });
    const r2 = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("avg place 1.4")).toBeInTheDocument();
    r2.unmount();
    state.screen = themed({ quiz: null, shows: "poll", poll: poll({ kind: "text", options: [], results: { responses: 3, texts: [{ id: "t1", text: "More pizza", name: "Diya", at: "2026-11-29T13:00:00Z" }] } }) });
    const r3 = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("More pizza")).toBeInTheDocument();
    expect(screen.getByText("Diya")).toBeInTheDocument();
    r3.unmount();
    state.screen = themed({ quiz: null, shows: "poll", poll: poll({ kind: "words", options: [], settings: { chart: "cloud" }, results: { responses: 9, words: [{ word: "rockets", count: 5 }, { word: "stars", count: 2 }] } }) });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("rockets")).toBeInTheDocument();
  });
});

const q = (id: string, text: string, votes: number, pinned = false) => ({ id, text, author_name: "Sneha J.", status: "approved", pinned, votes, created_at: "2026-11-29T13:00:00Z", answered_at: null });

describe("the room on the big screen", () => {
  it("puts the pinned question large on the Q&A wall with the most voted beside it", async () => {
    state.screen = themed({ quiz: null, shows: "qa", pinned: q("x1", "Is Pluto a planet again?", 14, true), wall: [q("x1", "Is Pluto a planet again?", 14, true), q("x2", "Where do we see the telescope?", 9), q("x3", "Will slides be shared?", 4)] });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Is Pluto a planet again?")).toBeInTheDocument();
    expect(screen.getByText("From the floor")).toBeInTheDocument();
    expect(screen.getByText("Where do we see the telescope?")).toBeInTheDocument();
    expect(screen.getAllByText("Is Pluto a planet again?")).toHaveLength(1);
  });

  it("runs the updates past as a ticker, and puts the sponsors along the foot", async () => {
    const u = (id: string, text: string) => ({ id, kind: "general", text, audience: "checked_in", recipients: 1, pushed: 1, sent_at: "2026-11-29T13:00:00Z" });
    state.screen = themed({
      theme: theme({ screen: { ...presetDraft("club").screen, sponsors: true } }),
      control: { ...CONTROL, ticker: true },
      updates: [u("u1", "Pizza at 8:30"), u("u2", "Telescope on the roof at 9")],
      sponsors: [{ name: "Orbit Labs", label: "Title sponsor", logo: { medium: "https://cdn.test/orbit.png" } }, { name: "Chai Point", label: null, logo: null }],
    });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByRole("marquee")).toHaveAccessibleName("Pizza at 8:30. Telescope on the roof at 9");
    const strip = screen.getByLabelText("Sponsors");
    expect(within(strip).getByAltText("Orbit Labs")).toBeInTheDocument();
    expect(within(strip).getByText("Chai Point")).toBeInTheDocument();
  });

  it("shows the agenda as an idle slide, with what is on now", async () => {
    state.screen = themed({
      quiz: null,
      shows: "idle",
      control: { ...CONTROL, idle_slides: ["agenda"] },
      agenda: [
        { id: "a1", title: "Telescope demo", starts_at: "2026-11-29T13:00:00Z", ends_at: "2026-11-29T13:30:00Z", speaker: "Dr. Rao", location: "Roof", now: true },
        { id: "a2", title: "Space quiz", starts_at: "2026-11-29T13:30:00Z", ends_at: null, speaker: null, location: null, now: false },
      ],
    });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Telescope demo")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Dr. Rao · Roof")).toBeInTheDocument();
  });

  it("turns the slides in order, and skips a sponsors slide with no sponsors", () => {
    vi.useFakeTimers();
    render(<IdleSlides slides={["agenda", "sponsors", "join"]} seconds={5} agenda={[]} sponsors={[]} join={<p>JOIN</p>} />);
    expect(screen.getByText("The programme shows here.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("JOIN")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("The programme shows here.")).toBeInTheDocument();
  });

  it("says there is nothing on the screen yet on the host screen, and offers the way in on the presenter", async () => {
    state.screen = themed({ quiz: null, shows: "qa" });
    const { unmount } = render(<ScreenPage eventId={37} />);
    expect(await screen.findByText(/Nothing on the screen yet/)).toBeInTheDocument();
    unmount();
    render(<PresentPage eventId={37} />);
    expect(await screen.findByText("Join the room from your phone")).toBeInTheDocument();
  });

  it("shows the board across the rounds when the host puts the leaderboard up", async () => {
    state.screen = themed({ quiz: quiz({ status: "ended", phase: "ended", question: null, leaderboard: BOARD }), shows: "leaderboard", overall: [{ rank: 1, name: "Kavya R.", score: 9100, rounds: 2 }, { rank: 2, name: "Arjun M.", score: 8800, rounds: 2 }] });
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Across the rounds")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Podium" })).getByText("Kavya R.")).toBeInTheDocument();
  });
});
