import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Two parts of the live room: the feedback survey (what it asks, when it
 * goes out, sending it now, what came back), and the projector screen at the
 * front of the room (the board, a pinned question, the poll, the quiz lobby,
 * its tally and its leaderboard, the last update).
 */
const writes: Array<{ method: string; path: string; body: unknown }> = [];
const results = { responses: 0, invited: 88, nps: null, averages: [], texts: [] };
const baseFeedback = {
  auto_send: true,
  delay_minutes: 60,
  sent_at: null as string | null,
  sent_count: 0,
  sends_at: "2099-10-13T18:00:00Z" as string | null,
  checked_in: 88,
  questions: [
    { key: "overall", kind: "rating", label: "How was the event overall?" },
    { key: "recommend", kind: "nps", label: "How likely are you to recommend us to a friend?" },
    { key: "change", kind: "text", label: "What should we change next time?" },
  ],
  results: results as Record<string, unknown>,
  previous: {
    event_id: 3,
    event_name: "Hack Night 03",
    responses: 74,
    invited: 88,
    nps: { score: 52, promoters: 61, passives: 30, detractors: 9, count: 74 },
    averages: [{ key: "overall", label: "Overall", average: 4.6, count: 74 }],
    texts: ["More time for hacking, less for talks."],
  } as Record<string, unknown> | null,
};
const question = (id: string, text: string, patch: Record<string, unknown> = {}) => ({ id, text, author_name: "Sneha J.", status: "approved", pinned: false, votes: 3, created_at: "2099-10-13T13:00:00Z", answered_at: null, ...patch });
const emptyScreen = { event: { id: 37, name: "Hack Night 04" }, pinned: null, board: [], poll: null, quiz: null, update: null };

const state: { feedback: typeof baseFeedback; screen: Record<string, unknown>; refuse: Error | null } = { feedback: baseFeedback, screen: emptyScreen, refuse: null };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/events/37/live/feedback") return state.feedback;
        if (path === "/api/v1/events/37/live/screen") return state.screen;
        // The AI summary beside the results is not what these tests are about; without its status it stays away.
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: Record<string, unknown>) => {
        writes.push({ method: "PUT", path, body });
        if (state.refuse) throw state.refuse;
        state.feedback = { ...state.feedback, ...(body as object) };
        return state.feedback;
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        writes.push({ method: "POST", path, body });
        if (state.refuse) throw state.refuse;
        state.feedback = { ...state.feedback, sent_at: "2099-10-13T17:00:00Z", sent_count: 88 };
        return { ...state.feedback, sent: 88, invited: 88 };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { formatDateTime } = await import("@moa/app-kit");
const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { FeedbackPanel } = await import("./components/feedback-panel");
const { ScreenPage } = await import("./components/screen-page");

beforeEach(() => {
  writes.length = 0;
  state.feedback = baseFeedback;
  state.screen = emptyScreen;
  state.refuse = null;
  vi.restoreAllMocks();
});

const puts = () => writes.filter((w) => w.method === "PUT");

describe("the feedback survey", () => {
  it("shows what it asks, when it goes out, and last event's results until this one's arrive", async () => {
    render(<FeedbackPanel eventId={37} />);
    expect(await screen.findByDisplayValue("How was the event overall?")).toBeInTheDocument();
    expect(screen.getByLabelText("Question 2")).toHaveValue("How likely are you to recommend us to a friend?");
    expect(screen.getByLabelText("Question 3")).toHaveValue("What should we change next time?");
    expect(screen.getByRole("switch", { name: "Send automatically" })).toBeChecked();
    expect(screen.getByLabelText("When the survey goes out")).toHaveValue("60");
    expect(screen.getByText(`Goes out ${formatDateTime("2099-10-13T18:00:00Z")} to everyone checked in`)).toBeInTheDocument();

    expect(screen.getByText("Results from Hack Night 03")).toBeInTheDocument();
    expect(screen.getByText("74 of 88 replied")).toBeInTheDocument();
    expect(screen.getByText("61% would recommend")).toBeInTheDocument();
    expect(screen.getByText("“More time for hacking, less for talks.”")).toBeInTheDocument();
  });

  it("turns automatic sending off", async () => {
    render(<FeedbackPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Send automatically" }));
    await waitFor(() => expect(puts()).toEqual([{ method: "PUT", path: "/api/v1/events/37/live/feedback", body: { auto_send: false } }]));
  });

  it("moves when it goes out", async () => {
    render(<FeedbackPanel eventId={37} />);
    fireEvent.change(await screen.findByLabelText("When the survey goes out"), { target: { value: "1440" } });
    await waitFor(() => expect(puts().map((w) => w.body)).toEqual([{ delay_minutes: 1440 }]));
  });

  it("adds a rating and a text question, and offers the recommend question only once", async () => {
    render(<FeedbackPanel eventId={37} />);
    await screen.findByDisplayValue("How was the event overall?");
    expect(screen.getByRole("button", { name: /Recommend 0–10/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Rating/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const sent = (puts()[0]!.body as { questions: Array<{ key: string; kind: string; label: string }> }).questions;
    expect(sent.slice(0, 3).map((q) => q.key)).toEqual(["overall", "recommend", "change"]);
    expect(sent[3]).toEqual({ key: "how_was_4", kind: "rating", label: "How was …?" });

    fireEvent.click(screen.getByRole("button", { name: /Open text/ }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    const second = (puts()[1]!.body as { questions: Array<{ kind: string; label: string }> }).questions;
    expect(second.at(-1)).toMatchObject({ kind: "text", label: "What should we change next time?" });
  });

  it("saves a reworded question when the field is left, trimmed", async () => {
    render(<FeedbackPanel eventId={37} />);
    const field = await screen.findByLabelText("Question 1");
    fireEvent.change(field, { target: { value: "  How was Hack Night 04?  " } });
    expect(puts()).toEqual([]);
    fireEvent.blur(field);
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect((puts()[0]!.body as { questions: Array<{ label: string }> }).questions[0]!.label).toBe("How was Hack Night 04?");
  });

  it("does not save a question left empty", async () => {
    render(<FeedbackPanel eventId={37} />);
    const field = await screen.findByLabelText("Question 1");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    // Give a save a moment to happen, if it were going to.
    await new Promise((r) => setTimeout(r, 50));
    expect(puts()).toEqual([]);
    expect(screen.getByLabelText("Question 1")).toHaveValue("   ");
  });

  it("removes a question, but never the last one", async () => {
    state.feedback = { ...baseFeedback, questions: baseFeedback.questions.slice(0, 2) };
    render(<FeedbackPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove question 1" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect((puts()[0]!.body as { questions: Array<{ key: string }> }).questions.map((q) => q.key)).toEqual(["recommend"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove question 1" })).toBeDisabled());
  });

  it("sends it now after a second look, to everyone checked in", async () => {
    const said = vi.spyOn(toast, "success");
    render(<FeedbackPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Send now/ }));
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Send to 88 now" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Survey sent to 88 people"));
    expect(writes).toEqual([{ method: "POST", path: "/api/v1/events/37/live/feedback/send", body: {} }]);
    expect(await screen.findByText(`Sent to 88 on ${formatDateTime("2099-10-13T17:00:00Z")}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send again/ })).toBeInTheDocument();
  });

  it("sends nothing when the organiser says not yet", async () => {
    render(<FeedbackPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Send now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.getByRole("button", { name: /Send now/ })).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it("cannot be sent before anyone is checked in, and says it waits to be sent by hand", async () => {
    state.feedback = { ...baseFeedback, checked_in: 0, auto_send: false, sends_at: null };
    render(<FeedbackPanel eventId={37} />);
    expect(await screen.findByRole("button", { name: /Send now/ })).toBeDisabled();
    expect(screen.getByText("Not scheduled — send it by hand when you are ready")).toBeInTheDocument();
  });

  it("says when sending is refused", async () => {
    state.refuse = new ApiError({ status: 429, message: "The survey went out a minute ago" });
    const said = vi.spyOn(toast, "error");
    render(<FeedbackPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Send now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send to 88 now" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("The survey went out a minute ago"));
  });

  it("says when a change to the survey is refused, and keeps the switch where the server has it", async () => {
    state.refuse = new ApiError({ status: 403, message: "Only an editor can change the survey" });
    const said = vi.spyOn(toast, "error");
    render(<FeedbackPanel eventId={37} />);
    const toggle = await screen.findByRole("switch", { name: "Send automatically" });
    fireEvent.click(toggle);
    await waitFor(() => expect(said).toHaveBeenCalledWith("Only an editor can change the survey"));
    expect(screen.getByRole("switch", { name: "Send automatically" })).toBeChecked();
  });

  it("shows this event's results once replies arrive, newest comment first", async () => {
    state.feedback = {
      ...baseFeedback,
      results: {
        responses: 12,
        invited: 88,
        nps: { score: -10, promoters: 20, passives: 50, detractors: 30, count: 12 },
        averages: [{ key: "overall", label: "How was the event overall?", average: 3.9, count: 12 }],
        texts: ["Too loud", "Great mentors", "Need more food"],
      },
    };
    render(<FeedbackPanel eventId={37} />);
    const card = (await screen.findByText("Results so far")).closest("[data-slot='figure-panel']") as HTMLElement;
    expect(within(card).getByText("12 of 88 replied")).toBeInTheDocument();
    expect(within(card).getByText("-10")).toBeInTheDocument();
    expect(within(card).getByText("30% wouldn't")).toBeInTheDocument();
    expect(within(card).getByText("3.9")).toBeInTheDocument();
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["“Need more food”", "“Great mentors”", "“Too loud”"]);
    expect(screen.queryByText("Results from Hack Night 03")).toBeNull();
  });

  it("says nothing came back when there is no earlier event to show", async () => {
    state.feedback = { ...baseFeedback, previous: null };
    render(<FeedbackPanel eventId={37} />);
    expect(await screen.findByText("Nothing back yet.")).toBeInTheDocument();
    expect(screen.getByText(/Replies land here within minutes/)).toBeInTheDocument();
  });
});

describe("the projector screen", () => {
  it("asks for this event's screen and says what to do when nothing is up", async () => {
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByRole("heading", { name: "Hack Night 04" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing on the screen yet/)).toBeInTheDocument();
  });

  it("shows the questions from the floor with their votes", async () => {
    state.screen = { ...emptyScreen, board: [question("x1", "Can we use TensorFlow Lite Micro?", { votes: 14 }), question("x2", "Is there food after?", { votes: 2 })] };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Questions from the floor")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["14Can we use TensorFlow Lite Micro?", "2Is there food after?"]);
    expect(screen.queryByText(/Nothing on the screen yet/)).toBeNull();
  });

  it("puts a pinned question up large, in place of the board", async () => {
    state.screen = { ...emptyScreen, pinned: question("x1", "How are the demos judged?", { pinned: true, votes: 1, author_name: null }), board: [question("x2", "Is there food after?")] };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("From the floor")).toBeInTheDocument();
    expect(screen.getByText("How are the demos judged?")).toBeInTheDocument();
    expect(screen.getByText("Anonymous · 1 vote")).toBeInTheDocument();
    expect(screen.queryByText("Is there food after?")).toBeNull();
  });

  it("shows the poll that is up with its answers", async () => {
    state.screen = {
      ...emptyScreen,
      poll: { id: "p2", kind: "choice", prompt: "How comfortable are you with embedded C?", options: ["Never", "A little"], status: "live", launched_at: null, closed_at: null, sort_order: 0, results: { responses: 59, choices: [{ label: "Never", count: 21, pct: 36 }, { label: "A little", count: 38, pct: 64 }] } },
    };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Poll · 59 answered")).toBeInTheDocument();
    expect(screen.getByText("How comfortable are you with embedded C?")).toBeInTheDocument();
    expect(screen.getByText("A little")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
  });

  it("shows the quiz lobby with its join code", async () => {
    state.screen = { ...emptyScreen, quiz: { status: "live", join_code: "4821", title: "Edge AI warm-up quiz", players: 1, current_index: -1, total: 2, question: null, leaderboard: [] } };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Join on your phone with this code")).toBeInTheDocument();
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getByText("1 player in")).toBeInTheDocument();
  });

  const running = (time_left: number) => ({
    status: "live",
    join_code: "4821",
    title: "Edge AI warm-up quiz",
    players: 30,
    current_index: 0,
    total: 2,
    question: {
      id: "q1",
      prompt: "How much RAM does an ESP32-S3 have on-chip?",
      options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }],
      correct_key: "a",
      seconds: 20,
      time_left,
      answered: 24,
      counts: [{ key: "a", label: "512 KB", count: 17, correct: true }, { key: "b", label: "8 MB", count: 7, correct: false }],
    },
    leaderboard: [{ rank: 1, name: "Rohan P.", score: 980 }, { rank: 2, name: "Sneha J.", score: 870 }],
  });

  it("keeps the tally hidden while a question runs, and the room sees the leaderboard", async () => {
    state.screen = { ...emptyScreen, quiz: running(12) };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Question 1 of 2 · 12s")).toBeInTheDocument();
    expect(screen.getByText("24 of 30 answered")).toBeInTheDocument();
    expect(screen.queryByText("17")).toBeNull();
    const board = (screen.getByText("Leaderboard").parentElement as HTMLElement);
    expect(within(board).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Rohan P.980", "2Sneha J.870"]);
  });

  it("shows the counts and marks the right answer once time is up", async () => {
    state.screen = { ...emptyScreen, quiz: running(0) };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Question 1 of 2 · time")).toBeInTheDocument();
    const right = screen.getByText("512 KB").closest("li")!;
    expect(within(right).getByText("17")).toBeInTheDocument();
    expect(right.className).toMatch(/ring-admit/);
    expect(screen.getByText("8 MB").closest("li")!.className).not.toMatch(/ring-admit/);
  });

  it("runs the last update along the bottom", async () => {
    state.screen = { ...emptyScreen, update: { id: "u1", kind: "room", text: "Demos move to Lab 3B", audience: "checked_in", recipients: 88, pushed: 80, sent_at: "2099-10-13T13:00:00Z" } };
    render(<ScreenPage eventId={37} />);
    expect(await screen.findByText("Demos move to Lab 3B")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("keeps itself fresh, reading the screen again every few seconds", async () => {
    render(<ScreenPage eventId={37} />);
    await screen.findByText(/Nothing on the screen yet/);
    state.screen = { ...emptyScreen, board: [question("x9", "A question that arrived later")] };
    expect(await screen.findByText("A question that arrived later", undefined, { timeout: 6000 })).toBeInTheDocument();
  });
});
