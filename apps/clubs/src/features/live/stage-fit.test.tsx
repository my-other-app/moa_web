import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render as bare, screen, within } from "@testing-library/react";

/**
 * The big screen fits what it shows into its 16:9 box (stage/parts.tsx
 * FIT_TEXT): it measures its content area and, while anything would be cut
 * off by the header or the sponsors and updates at the foot, packs it
 * tighter, step by step, without ever dropping an answer.
 *
 * jsdom lays nothing out, so the content area's measure is played here: it
 * reports content taller than the area until the step a test names (as the
 * DevFest screenshots measured at 1920×1080 with 100% text, the sponsor
 * strip and an update on). The real layout is checked in a browser by
 * feature-register/live-custom/devfest-fixes/tools/shoot.mjs.
 */

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

const { render } = await import("@/test/render");
const { Stage } = await import("./stage/stage");
const { AnswerTiles, FIT_LAST } = await import("./stage/parts");
const { addressParts } = await import("./stage/room");
const { codeSize } = await import("./stage/quiz");
const { screenSchema } = await import("./schemas");
const { presetDraft, resolveDraft } = await import("./theme");

const SLUG = "cloud-community-days-x-devfest-2026-ed39d1";
const EVENT = { id: 37, slug: SLUG };

/** The content area reports what is inside as taller than itself until it reaches step `fitsAt`. */
let fitsAt = 0;
const AREA = { w: 1782, h: 607 };
const level = (el: Element) => Number(el.getAttribute("data-fit"));
const props: Record<string, (el: HTMLElement) => number> = {
  clientHeight: (el) => (el.hasAttribute("data-fit") ? AREA.h : 0),
  clientWidth: (el) => (el.hasAttribute("data-fit") ? AREA.w : 0),
  scrollHeight: (el) => (el.hasAttribute("data-fit") ? (level(el) < fitsAt ? AREA.h + 400 : AREA.h) : 0),
  scrollWidth: (el) => (el.hasAttribute("data-fit") ? AREA.w : 0),
};
const saved = Object.fromEntries(Object.keys(props).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)]));
beforeEach(() => {
  fitsAt = 0;
  for (const [k, get] of Object.entries(props))
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get(this: HTMLElement) {
        return get(this);
      },
    });
});
afterEach(() => {
  for (const [k, d] of Object.entries(saved)) if (d) Object.defineProperty(HTMLElement.prototype, k, d);
});

const devfest = (over: Record<string, unknown> = {}) =>
  resolveDraft(
    {
      ...presetDraft("meridian_light"),
      colors: { background: "#FFFFFF", accent: "#4285F4", answers: ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#A142F4", "#24C1E0"] },
      leaderboard: { size: 5, podium: true, animate: true, own_rank: true },
      screen: { text_scale: 1, logo: false, sponsors: true, join: "lobby", answer_layout: "grid" },
      ...over,
    },
    {},
    null,
  );
const OPTIONS = [
  { key: "a", label: "Cloud Run" },
  { key: "b", label: "Compute Engine" },
  { key: "c", label: "Cloud Storage" },
  { key: "d", label: "BigQuery" },
];
const TEAMS = [
  { key: "kotlin", name: "Team Kotlin", color: "#A142F4", players: 3, score: 2281, rank: 1 },
  { key: "firebase", name: "Team Firebase", color: "#F9AB00", players: 3, score: 2245, rank: 2 },
  { key: "flutter", name: "Team Flutter", color: "#4285F4", players: 3, score: 1728, rank: 3 },
  { key: "android", name: "Team Android", color: "#34A853", players: 3, score: 544, rank: 4 },
];
const NAMES = ["Aparna", "Ananya K.", "Vishnu R.", "Sneha P.", "Nikhil J.", "Arjun S.", "Meera N.", "Rahul T.", "Fathima Z.", "Joel M.", "Devika S.", "Karthik V."];
const BOARD = NAMES.map((name, i) => ({ rank: i + 1, name, score: 908 - i * 36, team: TEAMS[i % 4]!.key }));
const UPDATE = { id: "u1", kind: "general", text: "Quiz finals at 4:00 pm in the Main Hall", audience: "checked_in", recipients: 0, pushed: 0, sent_at: "2026-11-28T10:30:00+05:30" };
const question = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  prompt: "Which Google Cloud service runs your container without you managing any servers?",
  options: OPTIONS,
  correct_key: "a",
  seconds: 30,
  time_left: 0,
  answered: 12,
  counts: OPTIONS.map((o, i) => ({ ...o, count: [9, 2, 0, 1][i]!, correct: o.key === "a" })),
  kind: "single",
  effective_points: 1000,
  revealed: true,
  ...over,
});
const quiz = (over: Record<string, unknown> = {}) => ({
  status: "live",
  join_code: "208815",
  title: "Cloud & Android",
  players: 12,
  current_index: 0,
  total: 6,
  question: question(),
  leaderboard: BOARD,
  phase: "revealed",
  round: { index: 0, count: 2 },
  board_now: true,
  teams: TEAMS,
  ...over,
});
const screenOf = (over: Record<string, unknown> = {}) =>
  screenSchema.parse({
    event: { id: 37, name: "Cloud Community Days x DevFest 2026" },
    pinned: null,
    board: [],
    poll: null,
    quiz: quiz(),
    update: UPDATE,
    theme: devfest(),
    theme_custom: true,
    theme_version: "devfest1",
    control: { mode: "auto", results: "live", ticker: false, idle_slides: [], slide_seconds: 12, wall_size: 6 },
    shows: "quiz",
    wall: [],
    updates: [UPDATE],
    agenda: [],
    sponsors: [
      { name: "DUK", label: "Academia Partner", logo: null },
      { name: "MyOtherApp", label: "Platform Partner", logo: null },
    ],
    overall: null,
    ...over,
  });

const area = () => document.querySelector<HTMLElement>("section[data-fit]")!;
const stage = (s = screenOf()) => render(<Stage screen={s} event={EVENT} variant="present" />);

describe("a revealed question with the teams and the board (the DevFest screenshot x2)", () => {
  it("draws as designed when it fits", () => {
    stage();
    expect(area()).toHaveAttribute("data-fit", "0");
    expect(within(screen.getByRole("region", { name: "Leaderboard" })).getAllByRole("listitem")).toHaveLength(5);
    // The answers stand in a column beside the boards.
    expect(screen.getByText("Compute Engine").closest("ul")).toHaveClass("grid-cols-1");
  });

  it("packs the teams to a line each, puts the answers in two columns and the board to three rows, keeping every answer", () => {
    fitsAt = 2;
    stage();
    expect(area()).toHaveAttribute("data-fit", "2");
    for (const o of OPTIONS) expect(screen.getByText(o.label)).toBeInTheDocument();
    expect(screen.getByText("Compute Engine").closest("ul")).toHaveClass("grid-cols-2");
    expect(within(screen.getByRole("region", { name: "Leaderboard" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Aparna908", "2Ananya K.872", "3Vishnu R.836"]);
    const teams = within(screen.getByRole("region", { name: "Teams" })).getAllByRole("listitem");
    expect(teams.map((li) => li.textContent)).toEqual(["1Team Kotlin2281", "2Team Firebase2245", "3Team Flutter1728", "4Team Android544"]);
    // The type is still the theme's: only the last steps make it smaller.
    expect(area().parentElement!.style.getPropertyValue("--t")).toBe("calc(var(--u) * var(--lt-scale))");
  });

  it("makes the type smaller at the last steps, and still never drops an answer", () => {
    fitsAt = Infinity;
    stage();
    expect(level(area())).toBe(FIT_LAST);
    // The whole stage's type, the header's and the foot's with it.
    expect(area().parentElement!.style.getPropertyValue("--t")).toBe("calc(var(--u) * var(--lt-scale) * 0.5)");
    for (const o of OPTIONS) expect(screen.getByText(o.label)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Leaderboard" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("stays on its step while the same question's figures change, and starts again from the next question", () => {
    fitsAt = 2;
    // The stage alone (no providers), so the rerenders below update it rather than mount another.
    const { rerender } = bare(<Stage screen={screenOf()} event={EVENT} variant="present" />);
    expect(area()).toHaveAttribute("data-fit", "2");
    // Room to spare now, but the same question: no jumping back and forth while answers land.
    fitsAt = 0;
    rerender(<Stage screen={screenOf({ quiz: quiz({ question: question({ answered: 12, counts: OPTIONS.map((o, i) => ({ ...o, count: [10, 1, 0, 1][i]!, correct: o.key === "a" })) }) }) })} event={EVENT} variant="present" />);
    expect(area()).toHaveAttribute("data-fit", "2");
    rerender(<Stage screen={screenOf({ quiz: quiz({ phase: "question", board_now: false, question: question({ id: "q2", time_left: 20, correct_key: null, revealed: false }) }) })} event={EVENT} variant="present" />);
    expect(area()).toHaveAttribute("data-fit", "0");
  });
});

describe("the round's final board (the DevFest screenshot x3)", () => {
  const ended = () =>
    screenOf({
      quiz: quiz({ status: "ended", phase: "ended", question: null, overall: NAMES.map((name, i) => ({ rank: i + 1, name, score: 5857 - i * 151, rounds: 2 })) }),
    });

  it("keeps the podium, two of the rest, every team and three across the rounds when it is short of room", () => {
    fitsAt = 6;
    stage(ended());
    expect(area()).toHaveAttribute("data-fit", "6");
    expect(within(screen.getByRole("region", { name: "Podium" })).getByLabelText("Place 1")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "And the rest" })).getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Teams" })).getAllByRole("listitem")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "Across the rounds" })).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("the lobby with the way in full screen (the DevFest screenshot x1)", () => {
  const lobby = () => screenOf({ quiz: quiz({ phase: "lobby", question: null, leaderboard: [], teams: null, board_now: false }) });

  it("wraps the event's address after a / or a -, never inside a word, and keeps it one address to copy", () => {
    stage(lobby());
    const address = `myotherapp.in/events/${SLUG}/live`;
    expect(addressParts(address)).toEqual(["myotherapp.in/", "events/", "cloud-", "community-", "days-", "x-", "devfest-", "2026-", "ed39d1/", "live"]);
    const line = screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === address && el.querySelector("wbr") !== null);
    expect(line.querySelectorAll("wbr")).toHaveLength(9);
    // The code stands large beside the QR, once.
    expect(screen.getByLabelText("Join code 208815")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quiz code 208815")).toBeNull();
  });

  it("draws the QR full size when it fits, and smaller as the stage packs tighter", async () => {
    const { unmount } = stage(lobby());
    expect((await screen.findByAltText(/QR code to join/)).style.width).toBe("calc(var(--u) * 24)");
    unmount();
    fitsAt = 2;
    stage(lobby());
    expect((await screen.findByAltText(/QR code to join/)).style.width).toBe("calc(var(--u) * 17)");
    expect(area()).toHaveAttribute("data-fit", "2");
  });

  it("sizes the code for its digits: six at full size, eight a little smaller", () => {
    expect(codeSize("208815")).toBe(11);
    expect(codeSize("20881512")).toBeLessThan(9);
    expect(codeSize(null)).toBe(11);
  });
});

describe("the programme between items", () => {
  const AGENDA = ["Registration and breakfast", "Keynote: building with Gemini", "Serverless with Cloud Run", "Flutter for the web, in production", "Lunch", "Kubernetes from zero"].map((title, i) => ({
    id: `a${i}`,
    title,
    starts_at: `2026-11-28T${String(9 + i).padStart(2, "0")}:30:00+05:30`,
    speaker: i % 2 ? "Kavitha Menon" : null,
    location: "Main Hall",
    now: i === 0,
  }));

  it("keeps all six slots on the slide, a line each and then in two columns", () => {
    fitsAt = 2;
    stage(screenOf({ shows: "idle", quiz: null, control: { mode: "auto", results: "live", ticker: false, idle_slides: ["agenda"], slide_seconds: 12, wall_size: 6 }, agenda: AGENDA }));
    expect(area()).toHaveAttribute("data-fit", "2");
    const list = screen.getByText("Lunch").closest("ol")!;
    expect(list).toHaveClass("grid-cols-2");
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  });
});

describe("answers keep their words whole", () => {
  /** Each label's longest word: wider than half a row, narrower than a whole one (or wider than both). */
  const wordWidth = { value: 60 };
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-label") ? wordWidth.value : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.hasAttribute("data-label")) return 0;
        return this.closest("ul")?.classList.contains("grid-cols-2") ? 40 : 120;
      },
    });
  });
  const tiles = () =>
    render(
      <AnswerTiles
        options={[
          { key: "a", label: "Saturn" },
          { key: "b", label: "Neptune" },
        ]}
        counts={[]}
        style="shapes"
        layout="grid"
        showCounts={false}
        revealed={false}
        correct={new Set()}
        answered={0}
        tight
      />,
    );

  it("moves the answers to one column rather than break a word inside", () => {
    wordWidth.value = 60;
    tiles();
    const ul = screen.getByText("Neptune").closest("ul")!;
    expect(ul).toHaveClass("grid-cols-1");
    expect(screen.getByText("Neptune")).toHaveClass("[overflow-wrap:normal]");
  });

  it("breaks a word only when it is wider than a whole row", () => {
    wordWidth.value = 200;
    tiles();
    expect(screen.getByText("Neptune")).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("keeps two columns when every word fits", () => {
    wordWidth.value = 30;
    tiles();
    expect(screen.getByText("Neptune").closest("ul")).toHaveClass("grid-cols-2");
  });
});
