import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * The present view — what a club casts to the projector — and the join QR
 * it is built around.
 *
 * The QR is the whole point of the screen: everyone without the app gets in
 * through it, from the back row of a hall. So what is checked here is what a
 * camera at ten metres depends on: the address it encodes, the error
 * correction, the quiet zone, and the same address printed underneath for
 * whoever gives up on scanning.
 */
const EVENT = {
  id: 37,
  name: "Hack Night 04 — Edge AI on a Shoestring",
  slug: "hack-night-04",
  status: "live",
  status_clock: true,
  poster: null,
  event_datetime: "2026-10-29T13:00:00Z",
  club: { id: 3, name: "Edge AI Club", slug: "edge-ai-club", logo: null },
};

const QUESTION = {
  id: "q3",
  prompt: "Which of these runs a wake-word model on 2 mW?",
  options: [
    { key: "a", label: "A Raspberry Pi 5" },
    { key: "b", label: "A Syntiant NDP120" },
  ],
  correct_key: "b",
  seconds: 30,
  time_left: 12,
  answered: 71,
  counts: [
    { key: "a", label: "A Raspberry Pi 5", count: 9, correct: false },
    { key: "b", label: "A Syntiant NDP120", count: 48, correct: true },
  ],
};

/** Eleven players, with a tie on third — the backend gives tied players the same rank. */
const LEADERBOARD = [
  { rank: 1, name: "Sneha J.", score: 4820 },
  { rank: 2, name: "Rohan P.", score: 4610 },
  { rank: 3, name: "Aparna M.", score: 4455 },
  { rank: 3, name: "Vikram S.", score: 4455 },
  { rank: 5, name: "Nikhil R.", score: 4120 },
  { rank: 6, name: "Fathima K.", score: 3980 },
  { rank: 7, name: "Arjun Rao", score: 3870 },
  { rank: 8, name: "Meera Pillai", score: 3705 },
  { rank: 9, name: "Dev Menon", score: 3540 },
  { rank: 10, name: "Anusha T.", score: 3310 },
  { rank: 11, name: "Joel George", score: 3104 },
];

const quizState = (over: Record<string, unknown> = {}) => ({
  status: "live",
  join_code: "4821",
  title: "Edge AI warm-up quiz",
  players: 86,
  current_index: 2,
  total: 6,
  question: null,
  leaderboard: LEADERBOARD,
  ...over,
});

const emptyScreen = { event: { id: 37, name: EVENT.name }, pinned: null, board: [], poll: null, quiz: null, update: null };

const state: { screen: Record<string, unknown>; event: Record<string, unknown> } = { screen: emptyScreen, event: EVENT };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/events/37/live/screen") return state.screen;
        if (path === "/api/v1/events/info/37") return state.event;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

/** The real qrcode library is a canvas away from jsdom; what matters here is what it is asked to draw. */
const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

// Node's own localStorage shadows jsdom's and has no backing file here.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { render } = await import("@/test/render");
const { PresentPage, qrSize } = await import("./components/present-page");
const { JoinQr } = await import("./components/join-qr");
const { roomAddress, roomUrl } = await import("./room");
const { liveNow, countdown } = await import("./components/console-bar");
const { notifyBudget, recordPush } = await import("./notify");

const ROOM_URL = "https://myotherapp.in/events/hack-night-04/live";

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  state.screen = emptyScreen;
  state.event = EVENT;
});

describe("the room's address", () => {
  it("is the event page's live child, by slug", () => {
    expect(roomUrl({ id: 37, slug: "hack-night-04" })).toBe(ROOM_URL);
    expect(roomAddress({ id: 37, slug: "hack-night-04" })).toBe("myotherapp.in/events/hack-night-04/live");
  });

  it("falls back to the id while the slug is still loading, which the site redirects", () => {
    expect(roomUrl({ id: 37, slug: null })).toBe("https://myotherapp.in/37/live");
    expect(roomAddress({ id: 37 })).toBe("myotherapp.in/37/live");
  });

  it("escapes a slug rather than pasting it into the path", () => {
    expect(roomUrl({ id: 9, slug: "a b/c" })).toBe("https://myotherapp.in/events/a%20b%2Fc/live");
  });
});

describe("the join QR", () => {
  it("encodes the room's URL at the highest error correction, with a full quiet zone", async () => {
    render(<JoinQr url={ROOM_URL} address="myotherapp.in/events/hack-night-04/live" size={420} />);
    const img = await screen.findByAltText("QR code to join the live room at myotherapp.in/events/hack-night-04/live");
    expect(img).toHaveAttribute("src", `data:image/png;base64,${btoa(ROOM_URL)}`);
    // H survives a head in the way; four modules is the spec's quiet zone.
    expect(qr.toDataURL).toHaveBeenCalledWith(ROOM_URL, { margin: 4, width: 420 * 3, errorCorrectionLevel: "H" });
  });

  it("prints the address under the code for whoever cannot scan it", async () => {
    render(<JoinQr url={ROOM_URL} address="myotherapp.in/events/hack-night-04/live" size={200} />);
    expect(await screen.findByText("myotherapp.in/events/hack-night-04/live")).toBeInTheDocument();
    expect(screen.getByText("Scan to join")).toBeInTheDocument();
  });

  it("offers the same code at print size only when asked", async () => {
    const { unmount } = render(<JoinQr url={ROOM_URL} address="a.b/c" size={120} />);
    await screen.findByText("a.b/c");
    expect(screen.queryByRole("link", { name: /QR for print/ })).toBeNull();
    expect(qr.toDataURL).not.toHaveBeenCalledWith(ROOM_URL, expect.objectContaining({ width: 2048 }));
    unmount();

    render(<JoinQr url={ROOM_URL} address="a.b/c" size={120} printable filename="join-37" />);
    const link = await screen.findByRole("link", { name: /QR for print/ });
    expect(link).toHaveAttribute("download", "join-37.png");
    expect(qr.toDataURL).toHaveBeenCalledWith(ROOM_URL, { margin: 4, width: 2048, errorCorrectionLevel: "H" });
  });
});

describe("how big the code is drawn", () => {
  it("takes a big share of a 1080p projector while nothing is being asked", () => {
    expect(qrSize(1920, 1080, false)).toBe(560);
    expect(qrSize(1280, 720, false)).toBe(435);
  });

  it("steps aside for the question, without shrinking out of reach", () => {
    expect(qrSize(1920, 1080, true)).toBe(240);
    expect(qrSize(1280, 720, true)).toBe(240);
  });

  it("never goes below a size a phone can still find", () => {
    expect(qrSize(360, 640, false)).toBe(240);
    expect(qrSize(360, 640, true)).toBe(130);
  });
});

describe("the present view", () => {
  it("gives the screen to the way in while nothing is being asked", async () => {
    render(<PresentPage eventId={37} />);
    expect(await screen.findByRole("heading", { name: EVENT.name })).toBeInTheDocument();
    const img = await screen.findByAltText("QR code to join the live room at myotherapp.in/events/hack-night-04/live");
    expect(img).toHaveAttribute("src", `data:image/png;base64,${btoa(ROOM_URL)}`);
    expect(screen.getByText("Join the room from your phone")).toBeInTheDocument();
  });

  it("shows the quiz's join code and who is in, while the quiz waits in its lobby", async () => {
    state.screen = { ...emptyScreen, quiz: quizState({ current_index: -1 }) };
    render(<PresentPage eventId={37} />);
    expect(await screen.findByLabelText("Join code 4821")).toHaveTextContent("4821");
    expect(screen.getByText("86 players in")).toBeInTheDocument();
    // The way in is still on the screen beside the code.
    expect(screen.getByAltText(`QR code to join the live room at myotherapp.in/events/hack-night-04/live`)).toBeInTheDocument();
  });

  it("shows only the top ten, and survives players tied on a rank", async () => {
    state.screen = { ...emptyScreen, quiz: quizState({ current_index: -1 }) };
    render(<PresentPage eventId={37} />);
    const board = await screen.findByRole("list");
    const rows = within(board).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(rows[2]).toHaveTextContent("3Aparna M.4455");
    expect(rows[3]).toHaveTextContent("3Vikram S.4455");
    expect(screen.queryByText("Joel George")).toBeNull();
  });

  it("gives the screen to the open question, and keeps a QR for latecomers", async () => {
    state.screen = { ...emptyScreen, quiz: quizState({ question: QUESTION }) };
    render(<PresentPage eventId={37} />);
    expect(await screen.findByRole("heading", { name: QUESTION.prompt })).toBeInTheDocument();
    expect(screen.getByText("Question 3 of 6")).toBeInTheDocument();
    expect(screen.getByText("A Syntiant NDP120")).toBeInTheDocument();
    expect(screen.getByText("12s")).toBeInTheDocument();
    expect(screen.getByText("71/86")).toBeInTheDocument();
    expect(screen.getByText("Late? Scan to join")).toBeInTheDocument();
    // The tally stays hidden while the question is open: it would give the answer away.
    expect(screen.queryByText("48")).toBeNull();
  });

  it("shows the tally once the clock has run out", async () => {
    state.screen = { ...emptyScreen, quiz: quizState({ question: { ...QUESTION, time_left: 0 } }) };
    render(<PresentPage eventId={37} />);
    expect(await screen.findByText("48")).toBeInTheDocument();
    expect(screen.getByText("Answers in")).toBeInTheDocument();
  });

  it("carries the last update along the bottom", async () => {
    state.screen = {
      ...emptyScreen,
      update: { id: "u2", kind: "schedule", text: "Demos start at 9:40 — ten minutes late", audience: "checked_in", recipients: 112, pushed: 96, sent_at: "2026-10-29T13:28:00Z" },
    };
    render(<PresentPage eventId={37} />);
    expect(await screen.findByText("Demos start at 9:40 — ten minutes late")).toBeInTheDocument();
  });
});

describe("what the console bar says is on air", () => {
  const base = { quizRunning: false, quizIndex: -1, quizTotal: 6, quizAnswered: null, quizPlayers: 0, pollPrompt: null, pollResponses: 0, qaOpen: false, qaOnBoard: 0 };

  it("is empty when the room is seeing nothing from the console", () => {
    expect(liveNow(base)).toEqual([]);
  });

  it("names the question the quiz is on and how many have answered", () => {
    const [quiz] = liveNow({ ...base, quizRunning: true, quizIndex: 2, quizAnswered: 71, quizPlayers: 86 });
    expect(quiz!.what).toBe("Quiz");
    expect(quiz!.detail).toBe("question 3 of 6 · 71 of 86 answered");
  });

  it("calls the lobby a lobby rather than question zero", () => {
    const [quiz] = liveNow({ ...base, quizRunning: true, quizIndex: -1, quizPlayers: 1 });
    expect(quiz!.detail).toBe("lobby · 1 player in");
  });

  it("carries a poll that is still up, which is the one a host forgets", () => {
    const on = liveNow({ ...base, pollPrompt: "What are you building tonight?", pollResponses: 64, qaOpen: true, qaOnBoard: 2 });
    expect(on.map((o) => o.what)).toEqual(["Poll", "Q&A"]);
    expect(on[0]!.detail).toBe("What are you building tonight? · 64 answered");
    expect(on[1]!.detail).toBe("2 on the board");
  });

  it("counts the wait down in minutes and seconds", () => {
    expect(countdown(107)).toBe("1:47");
    expect(countdown(9)).toBe("0:09");
    expect(countdown(0)).toBe("0:00");
  });
});

describe("what is left of the room's attention", () => {
  it("starts with nothing sent and nothing to wait for", () => {
    expect(notifyBudget(37)).toEqual({ sentToday: 0, waitSeconds: 0, spent: false });
  });

  it("counts a push that went, and holds the next for three minutes", () => {
    recordPush(37, { sent: 86 });
    const budget = notifyBudget(37);
    expect(budget.sentToday).toBe(1);
    expect(budget.waitSeconds).toBeGreaterThan(175);
    expect(budget.waitSeconds).toBeLessThanOrEqual(180);
  });

  it("counts nothing for a push that was skipped with nobody to tell", () => {
    recordPush(37, { sent: 0, skipped_reason: "nobody_checked_in" });
    expect(notifyBudget(37).sentToday).toBe(0);
  });

  it("learns another console's push from the refusal it causes here", () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    recordPush(37, { sent: 0, skipped_reason: "rate_limited", retry_after: 120, last_sent_at: at });
    const budget = notifyBudget(37);
    expect(budget.sentToday).toBe(1);
    // Three minutes from the push that is holding it, not from now.
    expect(budget.waitSeconds).toBeGreaterThan(110);
    expect(budget.waitSeconds).toBeLessThanOrEqual(121);
  });

  it("says when the day's ten are gone", () => {
    for (let i = 0; i < 10; i++) recordPush(37, { sent: 3 });
    expect(notifyBudget(37).spent).toBe(true);
  });

  it("keeps each event's count apart", () => {
    recordPush(37, { sent: 3 });
    expect(notifyBudget(38).sentToday).toBe(0);
  });
});
